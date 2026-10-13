import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, usuarioLogado, type SupabaseAdmin } from "@/lib/auth-servidor";
import { DOMINIO_RE, normalizarDominio } from "@/lib/associados";
import { cnpjValido, limparCnpj } from "@/lib/cnpj";

/**
 * Associados ABRACAM (desconto de associado).
 *
 * - O admin mantém a lista de instituições associadas: nome, CNPJ e os
 *   domínios de e-mail da instituição (Planos e pagamentos).
 * - No cadastro, quem marca "Sou associado(a)" só avança se o CNPJ estiver na
 *   lista E o e-mail for de um domínio da instituição. Quem já tem conta pode
 *   validar pelo Perfil. O admin também pode vincular manualmente na ficha.
 * - O vínculo é conferido de novo ao abrir Planos e ao fazer o pedido: se o
 *   CNPJ ou o e-mail deixarem de bater com a instituição, o desconto deixa de
 *   valer (o vínculo feito pelo admin não depende do domínio).
 */

export type MotivoAssociado = "cnpj" | "dominio";

const AVISO_DESMARCAR =
  "ou desmarque “Sou associado(a) ABRACAM” para continuar com o preço normal.";

export function mensagemAssociado(motivo: MotivoAssociado, desmarcar = true) {
  const fim = desmarcar ? ` Confira os dados ${AVISO_DESMARCAR}` : "";
  return motivo === "dominio"
    ? `O e-mail informado não é da instituição associada deste CNPJ. Para ter o desconto de associado, use o seu e-mail da instituição (ex.: nome@suainstituicao.com.br).${fim}`
    : `Este CNPJ não está na lista de instituições associadas à ABRACAM.${fim}`;
}

/** CNPJ + domínio do e-mail conferem com uma instituição associada ativa? */
export async function verificarAssociado(
  supabaseAdmin: SupabaseAdmin,
  cnpj: string | null | undefined,
  email: string | null | undefined,
): Promise<{ ok: true; id: string; nome: string } | { ok: false; motivo: MotivoAssociado }> {
  const { data, error } = await supabaseAdmin.rpc("verificar_associado", {
    p_cnpj: cnpj ?? "",
    p_email: email ?? "",
  });
  if (error) throw new Error(error.message);
  const r = data?.[0];
  if (r?.motivo === "ok" && r.associado_id) return { ok: true, id: r.associado_id, nome: r.nome };
  return { ok: false, motivo: r?.motivo === "dominio" ? "dominio" : "cnpj" };
}

export type AssociadoVigente = {
  id: string;
  nome: string;
  origem: "cadastro" | "perfil" | "admin";
};

/**
 * Vínculo do aluno que vale agora. Instituição desativada: sem desconto (o
 * vínculo fica guardado e volta a valer se ela for reativada). CNPJ ou e-mail
 * que não batem mais: o vínculo é desfeito.
 */
export async function associadoVigente(
  supabaseAdmin: SupabaseAdmin,
  userId: string,
  email: string | null | undefined,
): Promise<AssociadoVigente | null> {
  const { data: perfil, error } = await supabaseAdmin
    .from("profiles")
    .select("cnpj, associado_id, associado_origem")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil?.associado_id) return null;

  const { data: inst, error: eInst } = await supabaseAdmin
    .from("associados")
    .select("id, nome, ativo")
    .eq("id", perfil.associado_id)
    .maybeSingle();
  if (eInst) throw new Error(eInst.message);
  if (!inst?.ativo) return null;

  const origem = (perfil.associado_origem ?? "cadastro") as AssociadoVigente["origem"];
  if (origem === "admin") return { id: inst.id, nome: inst.nome, origem };

  const v = await verificarAssociado(supabaseAdmin, perfil.cnpj, email);
  if (v.ok) return { id: inst.id, nome: inst.nome, origem };

  const { error: eLimpar } = await supabaseAdmin
    .from("profiles")
    .update({ associado_id: null, associado_em: null, associado_origem: null })
    .eq("id", userId)
    .eq("associado_id", perfil.associado_id);
  if (eLimpar) throw new Error(eLimpar.message);
  return null;
}

// ---------------------------------------------------------------------
// Aluno: validar o vínculo pelo Perfil (conta que já existia)
// ---------------------------------------------------------------------
const cnpjObrigatorio = z
  .string({ required_error: "Informe o CNPJ da instituição associada." })
  .trim()
  .transform(limparCnpj)
  .refine((v) => v.length > 0, "Informe o CNPJ da instituição associada.")
  .refine((v) => cnpjValido(v), "CNPJ inválido.");

export const validarMeuAssociado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, cnpj: cnpjObrigatorio }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const v = await verificarAssociado(supabaseAdmin, data.cnpj, user.email);
    if (!v.ok) throw new Error(mensagemAssociado(v.motivo, false));
    // O CNPJ do cadastro passa a ser o da instituição (é por ele que o vínculo é conferido)
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        cnpj: data.cnpj,
        associado_id: v.id,
        associado_em: new Date().toISOString(),
        associado_origem: "perfil",
      })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
    return { nome: v.nome };
  });

// ---------------------------------------------------------------------
// Admin: lista de instituições associadas
// ---------------------------------------------------------------------
const dominiosSchema = z
  .array(z.string())
  .transform((lista) => [...new Set(lista.map(normalizarDominio).filter(Boolean))])
  .superRefine((lista, ctx) => {
    if (lista.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe pelo menos um domínio de e-mail da instituição (ex.: abracam.com).",
      });
    }
    if (lista.length > 20) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No máximo 20 domínios." });
    }
    const ruim = lista.find((d) => !DOMINIO_RE.test(d));
    if (ruim) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Domínio inválido: ${ruim}` });
    }
  });

const nomeInstituicaoSchema = z
  .string()
  .trim()
  .min(2, "Informe o nome da instituição.")
  .max(150, "Nome muito longo.");

function erroGravacao(error: { message: string; code?: string }) {
  if (error.code === "23505") return "Já existe uma instituição associada com este CNPJ.";
  return error.message;
}

export const listarAssociados = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: lista, error } = await supabaseAdmin
      .from("associados")
      .select("id, nome, cnpj, dominios, vale_filiais, ativo, created_at")
      .order("nome");
    if (error) throw new Error(error.message);
    // Alunos vinculados a cada instituição (lidos em blocos: o Supabase devolve até 1.000 por vez)
    const alunos = new Map<string, number>();
    for (let inicio = 0; ; inicio += 1000) {
      const { data: vinculos, error: eVinc } = await supabaseAdmin
        .from("profiles")
        .select("associado_id")
        .not("associado_id", "is", null)
        .order("id")
        .range(inicio, inicio + 999);
      if (eVinc) throw new Error(eVinc.message);
      for (const v of vinculos ?? []) {
        if (v.associado_id) alunos.set(v.associado_id, (alunos.get(v.associado_id) ?? 0) + 1);
      }
      if ((vinculos?.length ?? 0) < 1000) break;
    }
    return {
      associados: (lista ?? []).map((a) => ({
        id: a.id,
        nome: a.nome,
        cnpj: a.cnpj,
        dominios: a.dominios,
        valeFiliais: a.vale_filiais,
        ativo: a.ativo,
        criadoEm: a.created_at,
        alunos: alunos.get(a.id) ?? 0,
      })),
    };
  });

export const salvarAssociado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        id: z.string().uuid().nullable().default(null),
        nome: nomeInstituicaoSchema,
        cnpj: cnpjObrigatorio,
        dominios: dominiosSchema,
        valeFiliais: z.boolean().default(false),
        ativo: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const row = {
      nome: data.nome,
      cnpj: data.cnpj,
      dominios: data.dominios,
      vale_filiais: data.valeFiliais,
      ativo: data.ativo,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("associados").update(row).eq("id", data.id)
      : await supabaseAdmin.from("associados").insert({ ...row, created_by: user.id });
    if (error) throw new Error(erroGravacao(error));
    return { ok: true as const };
  });

export const excluirAssociado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    // Os alunos vinculados perdem o vínculo (ON DELETE SET NULL); pedidos antigos guardam o registro do desconto
    const { error } = await supabaseAdmin.from("associados").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Importação em lote: uma instituição por linha, no formato
 * "Nome; CNPJ; dominio1, dominio2". CNPJ já cadastrado é atualizado.
 */
export const importarAssociados = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        texto: z.string().max(200000, "Texto muito longo (até cerca de 2.000 linhas)."),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const erros: { linha: number; motivo: string }[] = [];
    const porCnpj = new Map<string, { nome: string; cnpj: string; dominios: string[] }>();

    data.texto.split(/\r?\n/).forEach((bruta, i) => {
      const linha = bruta.trim();
      if (!linha) return;
      const partes = linha.split(/[;\t]/).map((p) => p.trim());
      if (partes.length < 3) {
        erros.push({ linha: i + 1, motivo: "Use o formato: Nome; CNPJ; domínio(s)." });
        return;
      }
      const [nomeBruto, cnpjBruto, ...resto] = partes;
      // Cabeçalho da planilha (Nome; CNPJ; Domínios): ignora
      if (i === 0 && limparCnpj(cnpjBruto ?? "") === "") return;
      const nome = nomeInstituicaoSchema.safeParse(nomeBruto);
      const cnpj = cnpjObrigatorio.safeParse(cnpjBruto);
      const dominios = dominiosSchema.safeParse(resto.join(",").split(/[,\s]+/));
      const falha = [nome, cnpj, dominios].find((r) => !r.success);
      if (falha && !falha.success) {
        erros.push({ linha: i + 1, motivo: falha.error.issues[0]?.message ?? "Linha inválida." });
        return;
      }
      if (nome.success && cnpj.success && dominios.success) {
        porCnpj.set(cnpj.data, { nome: nome.data, cnpj: cnpj.data, dominios: dominios.data });
      }
    });

    const linhas = [...porCnpj.values()];
    if (linhas.length > 2000) throw new Error("Importe no máximo 2.000 instituições por vez.");
    let novos = 0;
    let atualizados = 0;
    if (linhas.length) {
      const { data: existentes, error: eEx } = await supabaseAdmin
        .from("associados")
        .select("cnpj")
        .in(
          "cnpj",
          linhas.map((l) => l.cnpj),
        );
      if (eEx) throw new Error(eEx.message);
      const ja = new Set((existentes ?? []).map((e) => e.cnpj));
      const atualizar = linhas.filter((l) => ja.has(l.cnpj));
      const inserir = linhas.filter((l) => !ja.has(l.cnpj));
      // Já cadastrada: atualiza nome e domínios (mantém se está ativa e se vale para filiais)
      if (atualizar.length) {
        const { error } = await supabaseAdmin
          .from("associados")
          .upsert(atualizar, { onConflict: "cnpj" });
        if (error) throw new Error(erroGravacao(error));
      }
      if (inserir.length) {
        const { error } = await supabaseAdmin
          .from("associados")
          .insert(inserir.map((l) => ({ ...l, created_by: user.id })));
        if (error) throw new Error(erroGravacao(error));
      }
      atualizados = atualizar.length;
      novos = inserir.length;
    }
    return { novos, atualizados, erros };
  });

// ---------------------------------------------------------------------
// Admin: vínculo do aluno (ficha em Usuários e planos)
// ---------------------------------------------------------------------
export const definirAssociadoUsuario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        userId: z.string().uuid(),
        associadoId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(
        data.associadoId
          ? {
              associado_id: data.associadoId,
              associado_em: new Date().toISOString(),
              associado_origem: "admin",
            }
          : { associado_id: null, associado_em: null, associado_origem: null },
      )
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
