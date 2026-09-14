import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DIFICULDADES,
  NIVEIS,
  questaoParaRow,
  questaoSchema,
  type QuestaoRow,
} from "@/lib/questoes-schema";

/**
 * Funções de servidor do banco de questões.
 * Todas exigem o access token do usuário logado e verificam o papel de admin
 * na tabela user_roles antes de usar o cliente com service_role.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

async function exigirAdmin(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");

  const { data: papel } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!papel) throw new Error("Acesso restrito a administradores.");
  return { supabaseAdmin, user: data.user };
}

// ---------------------------------------------------------------------
// Verificação de papel (usada para liberar o painel Admin)
// ---------------------------------------------------------------------
export const verificarAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: auth, error } = await supabaseAdmin.auth.getUser(data.token);
    if (error || !auth.user)
      return { isAdmin: false as const, email: null, existeAlgumAdmin: true };

    const [{ data: papel }, { count }] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("role", "admin")
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin"),
    ]);

    return {
      isAdmin: Boolean(papel),
      email: auth.user.email ?? null,
      existeAlgumAdmin: (count ?? 0) > 0,
    };
  });

// ---------------------------------------------------------------------
// Importação de lote (JSON ou CSV já lidos e validados no navegador;
// o servidor valida de novo antes de gravar)
// ---------------------------------------------------------------------
const importarSchema = z.object({
  token: tokenSchema,
  arquivo: z.string().min(1).max(200),
  formato: z.enum(["json", "csv"]),
  questoes: z.array(questaoSchema).min(1, "Nenhuma questão válida para importar.").max(2000),
});

export const importarQuestoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importarSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);

    const ids = data.questoes.map((q) => q.id);
    const existentes = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data: rows, error } = await supabaseAdmin
        .from("questoes")
        .select("id")
        .in("id", ids.slice(i, i + 500));
      if (error) throw new Error(`Falha ao consultar questões existentes: ${error.message}`);
      for (const r of rows ?? []) existentes.add(r.id);
    }

    const { data: imp, error: impErr } = await supabaseAdmin
      .from("importacoes")
      .insert({
        user_id: user.id,
        arquivo: data.arquivo,
        formato: data.formato,
        total_lidas: data.questoes.length,
      })
      .select("id")
      .single();
    if (impErr || !imp)
      throw new Error(`Falha ao registrar a importação: ${impErr?.message ?? "sem id"}`);

    const rows = data.questoes.map((q) => questaoParaRow(q, imp.id));
    const erros: { id: string; erro: string }[] = [];
    let gravadas = 0;

    for (let i = 0; i < rows.length; i += 100) {
      const lote = rows.slice(i, i + 100);
      const { error } = await supabaseAdmin.from("questoes").upsert(lote, { onConflict: "id" });
      if (error) {
        // Tenta uma a uma para apontar exatamente quais falharam.
        for (const row of lote) {
          const { error: e1 } = await supabaseAdmin
            .from("questoes")
            .upsert(row, { onConflict: "id" });
          if (e1) erros.push({ id: row.id, erro: e1.message });
          else gravadas++;
        }
      } else gravadas += lote.length;
    }

    const inseridas = rows.filter(
      (r) => !existentes.has(r.id) && !erros.some((e) => e.id === r.id),
    ).length;
    const atualizadas = gravadas - inseridas;

    await supabaseAdmin
      .from("importacoes")
      .update({
        total_inseridas: inseridas,
        total_atualizadas: atualizadas,
        total_erros: erros.length,
        erros,
      })
      .eq("id", imp.id);

    return { importacaoId: imp.id, lidas: rows.length, inseridas, atualizadas, erros };
  });

// ---------------------------------------------------------------------
// Resumo para o painel (contagem por tema, últimas importações)
// ---------------------------------------------------------------------
export const resumoQuestoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);

    const [
      { data: porTema, error: e1 },
      { data: importacoes, error: e2 },
      { count: usuarios },
      { count: pendentes },
    ] = await Promise.all([
      supabaseAdmin.rpc("contar_questoes_por_tema"),
      supabaseAdmin
        .from("importacoes")
        .select(
          "id, arquivo, formato, total_lidas, total_inseridas, total_atualizadas, total_erros, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("questoes")
        .select("id", { count: "exact", head: true })
        .eq("status", "rascunho"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    const temas = (porTema ?? []).map((t) => ({
      tema: Number(t.tema),
      total: Number(t.total),
      ativas: Number(t.ativas),
    }));
    return {
      temas,
      total: temas.reduce((s, t) => s + t.total, 0),
      ativas: temas.reduce((s, t) => s + t.ativas, 0),
      usuarios: usuarios ?? 0,
      pendentes: pendentes ?? 0,
      importacoes: importacoes ?? [],
    };
  });

// ---------------------------------------------------------------------
// Listagem com filtros e paginação
// ---------------------------------------------------------------------
const listarSchema = z.object({
  token: tokenSchema,
  tema: z.number().int().min(1).max(4).nullable().default(null),
  nivel: z.enum(NIVEIS).nullable().default(null),
  dificuldade: z.enum(DIFICULDADES).nullable().default(null),
  status: z.enum(["rascunho", "aprovada"]).nullable().default(null),
  ativa: z.boolean().nullable().default(null),
  busca: z.string().trim().max(120).default(""),
  pagina: z.number().int().min(1).default(1),
  porPagina: z.number().int().min(5).max(100).default(20),
});

export const listarQuestoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listarSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);

    let q = supabaseAdmin.from("questoes").select("*", { count: "exact" });
    if (data.tema !== null) q = q.eq("tema", data.tema);
    if (data.nivel !== null) q = q.eq("nivel", data.nivel);
    if (data.dificuldade !== null) q = q.eq("dificuldade", data.dificuldade);
    if (data.status !== null) q = q.eq("status", data.status);
    if (data.ativa !== null) q = q.eq("ativa", data.ativa);
    if (data.busca.length > 0) {
      const termo = data.busca.replace(/[%_,]/g, " ");
      q = q.or(`id.ilike.%${termo}%,enunciado.ilike.%${termo}%,subtema.ilike.%${termo}%`);
    }

    const de = (data.pagina - 1) * data.porPagina;
    const {
      data: rows,
      count,
      error,
    } = await q.order("id", { ascending: true }).range(de, de + data.porPagina - 1);
    if (error) throw new Error(error.message);

    return { questoes: (rows ?? []) as unknown as QuestaoRow[], total: count ?? 0 };
  });

// ---------------------------------------------------------------------
// Ativar / desativar / aprovar e excluir
// ---------------------------------------------------------------------
export const atualizarQuestao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        id: z.string().min(5),
        ativa: z.boolean().optional(),
        status: z.enum(["rascunho", "aprovada"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const patch: { ativa?: boolean; status?: "rascunho" | "aprovada" } = {};
    if (data.ativa !== undefined) patch.ativa = data.ativa;
    if (data.status !== undefined) patch.status = data.status;
    const { error } = await supabaseAdmin.from("questoes").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const excluirQuestoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, ids: z.array(z.string().min(5)).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error, count } = await supabaseAdmin
      .from("questoes")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { excluidas: count ?? 0 };
  });
