import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cnpjValido, limparCnpj } from "@/lib/cnpj";
import { cpfValido, hashCpf, limparCpf } from "@/lib/cpf";
import { acessoAtivo, PLANOS, PLANOS_PAGOS } from "@/lib/planos";

/**
 * Conta do aluno e gestão de usuários pelo admin.
 *
 * - cadastrarAluno: cria a conta já com nome completo, CPF, CNPJ e instituição.
 *   O CPF nunca vai para os metadados do Supabase Auth (que viajam no token);
 *   ele é gravado direto no perfil pelo servidor.
 * - completarCadastro: mesmo formulário para quem entrou pelo Google ou já
 *   tinha conta antes do cadastro completo.
 * - statusConta: o que o app precisa saber a cada página (cadastro, admin, plano).
 * - listarUsuarios / detalheUsuario / atualizarCadastroUsuario / atualizarPlano:
 *   painel /admin/usuarios.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

const nomeSchema = z
  .string()
  .trim()
  .min(5, "Informe o nome completo.")
  .max(120, "Nome muito longo.")
  .refine((v) => v.split(/\s+/).length >= 2, "Informe nome e sobrenome.");

const cpfSchema = z
  .string()
  .trim()
  .refine((v) => cpfValido(v), "CPF inválido.")
  .transform(limparCpf);

const cnpjSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? limparCnpj(v) : ""))
  .refine((v) => v === "" || cnpjValido(v), "CNPJ inválido.")
  .transform((v) => v || null);

const instituicaoSchema = z
  .string()
  .trim()
  .min(2, "Informe a instituição.")
  .max(150, "Nome da instituição muito longo.");

const dadosCadastroSchema = z.object({
  nome: nomeSchema,
  cpf: cpfSchema,
  cnpj: cnpjSchema,
  instituicao: instituicaoSchema,
});

// ---------------------------------------------------------------------
// Utilitários de servidor
// ---------------------------------------------------------------------

async function servidor() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof servidor>>;

async function usuarioDoToken(supabaseAdmin: Admin, token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user;
}

async function ehAdmin(supabaseAdmin: Admin, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function exigirAdmin(token: string) {
  const supabaseAdmin = await servidor();
  const user = await usuarioDoToken(supabaseAdmin, token);
  if (!(await ehAdmin(supabaseAdmin, user.id))) {
    throw new Error("Acesso restrito a administradores.");
  }
  return { supabaseAdmin, user };
}

function salCpf() {
  return process.env["CPF_SAL"] || "abracam-simulador-abt";
}

/** O CPF (ou o hash dele) já pertence a outra conta? */
async function cpfEmUso(supabaseAdmin: Admin, cpf: string, hash: string, excetoId?: string) {
  let consulta = supabaseAdmin
    .from("profiles")
    .select("id")
    .or(`cpf.eq.${cpf},cpf_hash.eq.${hash}`);
  if (excetoId) consulta = consulta.neq("id", excetoId);
  const { data, error } = await consulta.limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * Cliente público (chave publicável) criado a cada chamada, sem guardar
 * sessão: o cadastro passa pelo fluxo normal do Supabase Auth, inclusive o
 * e-mail de confirmação, sem misturar sessões entre requisições.
 */
async function clientePublico() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const chave =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !chave) throw new Error("Configuração do Supabase ausente no servidor.");

  // Mesma correção do client.ts: chaves novas (sb_publishable_) não são JWT.
  const fetchComChave: typeof fetch = (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (chave.startsWith("sb_") && headers.get("Authorization") === `Bearer ${chave}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", chave);
    return fetch(input, { ...init, headers });
  };

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchComChave },
  });
}

function traduzirErroAuth(msg: string) {
  if (/already (been )?registered|already exists/i.test(msg)) {
    return "Este e-mail já possui uma conta. Use a opção Entrar.";
  }
  if (/rate limit|too many/i.test(msg)) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  if (/password/i.test(msg)) {
    return "A senha não atende aos requisitos mínimos. Use pelo menos 6 caracteres.";
  }
  if (/signups? not allowed|disabled/i.test(msg)) {
    return "O cadastro de novas contas está desativado no momento.";
  }
  if (/invalid/i.test(msg) && /email/i.test(msg)) return "E-mail inválido.";
  return msg;
}

// ---------------------------------------------------------------------
// Status da conta (cadastro completo, admin, plano)
// ---------------------------------------------------------------------
export const statusConta = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = await servidor();
    const user = await usuarioDoToken(supabaseAdmin, data.token);
    const [{ data: perfil }, admin] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "nome_completo, full_name, cpf, cpf_hash, instituicao, plano, plano_validade, cadastro_completo_em",
        )
        .eq("id", user.id)
        .maybeSingle(),
      ehAdmin(supabaseAdmin, user.id),
    ]);
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const nomeMeta =
      (typeof meta["full_name"] === "string" && meta["full_name"]) ||
      (typeof meta["name"] === "string" && meta["name"]) ||
      "";

    return {
      email: user.email ?? null,
      isAdmin: admin,
      cadastroCompleto: Boolean(perfil?.cadastro_completo_em && perfil?.cpf),
      sugestaoNome: perfil?.nome_completo ?? perfil?.full_name ?? nomeMeta,
      plano: perfil?.plano ?? "gratis",
      planoValidade: perfil?.plano_validade ?? null,
      acessoAtivo: acessoAtivo(perfil?.plano, perfil?.plano_validade),
    };
  });

// ---------------------------------------------------------------------
// Página Perfil: dados da própria conta e preferência do ranking
// ---------------------------------------------------------------------
export const meuPerfil = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = await servidor();
    const user = await usuarioDoToken(supabaseAdmin, data.token);
    const [{ data: perfil, error }, admin] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "nome_completo, full_name, username, email, cpf, cpf_hash, cnpj, instituicao, plano, plano_validade, cadastro_completo_em, created_at, show_in_ranking",
        )
        .eq("id", user.id)
        .maybeSingle(),
      ehAdmin(supabaseAdmin, user.id),
    ]);
    if (error) throw new Error(error.message);

    let gratuidadeUsada = false;
    if (perfil?.cpf_hash) {
      const { data: usada } = await supabaseAdmin
        .from("gratuidade_usada")
        .select("usada_em")
        .eq("cpf_hash", perfil.cpf_hash)
        .maybeSingle();
      gratuidadeUsada = Boolean(usada);
    }

    const provedores = (user.app_metadata?.["providers"] as string[] | undefined) ?? [
      (user.app_metadata?.["provider"] as string | undefined) ?? "email",
    ];

    return {
      nome: perfil?.nome_completo ?? perfil?.full_name ?? perfil?.username ?? "",
      email: user.email ?? perfil?.email ?? null,
      cpf: perfil?.cpf ?? null,
      cnpj: perfil?.cnpj ?? null,
      instituicao: perfil?.instituicao ?? null,
      criadoEm: perfil?.created_at ?? user.created_at,
      cadastroCompletoEm: perfil?.cadastro_completo_em ?? null,
      provedores,
      plano: perfil?.plano ?? "gratis",
      planoValidade: perfil?.plano_validade ?? null,
      acessoAtivo: acessoAtivo(perfil?.plano, perfil?.plano_validade),
      isAdmin: admin,
      gratuidadeUsada,
      participaRanking: perfil?.show_in_ranking ?? true,
    };
  });

export const definirParticipacaoRanking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, participar: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabaseAdmin = await servidor();
    const user = await usuarioDoToken(supabaseAdmin, data.token);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ show_in_ranking: data.participar })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
    return { participar: data.participar };
  });

// ---------------------------------------------------------------------
// Cadastro de nova conta (tela /auth, aba "Criar conta")
// ---------------------------------------------------------------------
const novoCadastroSchema = dadosCadastroSchema.extend({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z
    .string()
    .min(6, "A senha precisa ter pelo menos 6 caracteres.")
    .max(72, "Senha muito longa."),
  redirectTo: z.string().url().optional(),
});

export const cadastrarAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => novoCadastroSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = await servidor();
    const cpfHash = await hashCpf(data.cpf, salCpf());
    if (await cpfEmUso(supabaseAdmin, data.cpf, cpfHash)) {
      throw new Error("Este CPF já possui cadastro. Entre com a sua conta ou fale com a ABRACAM.");
    }

    const publico = await clientePublico();
    const { data: res, error } = await publico.auth.signUp({
      email: data.email,
      password: data.senha,
      options: {
        ...(data.redirectTo ? { emailRedirectTo: data.redirectTo } : {}),
        // Só dados não sensíveis nos metadados (eles vão no token de sessão)
        data: { full_name: data.nome, username: primeiroNome(data.nome) },
      },
    });
    if (error) throw new Error(traduzirErroAuth(error.message));
    const user = res.user;
    // Com confirmação de e-mail ligada, e-mail já cadastrado volta sem identidades
    if (!user || (user.identities && user.identities.length === 0)) {
      throw new Error("Este e-mail já possui uma conta. Use a opção Entrar.");
    }

    const { error: ePerfil } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: data.email,
      username: primeiroNome(data.nome),
      full_name: data.nome,
      nome_completo: data.nome,
      cpf: data.cpf,
      cpf_hash: cpfHash,
      cnpj: data.cnpj,
      instituicao: data.instituicao,
      cadastro_completo_em: new Date().toISOString(),
    });
    if (ePerfil) {
      // Não deixa conta órfã sem os dados obrigatórios
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw new Error(
        /cpf/i.test(ePerfil.message)
          ? "Este CPF já possui cadastro."
          : `Falha ao salvar o cadastro: ${ePerfil.message}`,
      );
    }

    return {
      sessao: res.session
        ? { access_token: res.session.access_token, refresh_token: res.session.refresh_token }
        : null,
    };
  });

// ---------------------------------------------------------------------
// Completar cadastro (login pelo Google ou conta antiga)
// ---------------------------------------------------------------------
export const completarCadastro = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => dadosCadastroSchema.extend({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = await servidor();
    const user = await usuarioDoToken(supabaseAdmin, data.token);

    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("cpf, cpf_hash, cadastro_completo_em")
      .eq("id", user.id)
      .maybeSingle();
    if (perfil?.cpf && perfil.cadastro_completo_em) {
      throw new Error("Seu cadastro já está completo. Para alterar dados, fale com a ABRACAM.");
    }

    const cpfHash = await hashCpf(data.cpf, salCpf());
    // Quem já tinha informado um CPF antes (teste grátis) não pode trocá-lo aqui
    if (perfil?.cpf_hash && perfil.cpf_hash !== cpfHash) {
      throw new Error(
        "Este CPF é diferente do que já foi informado nesta conta. Fale com a ABRACAM para corrigir.",
      );
    }
    if (await cpfEmUso(supabaseAdmin, data.cpf, cpfHash, user.id)) {
      throw new Error("Este CPF já está cadastrado em outra conta.");
    }

    const { error } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: user.email ?? null,
      full_name: data.nome,
      nome_completo: data.nome,
      cpf: data.cpf,
      cpf_hash: cpfHash,
      cnpj: data.cnpj,
      instituicao: data.instituicao,
      cadastro_completo_em: new Date().toISOString(),
    });
    if (error) {
      throw new Error(/cpf/i.test(error.message) ? "Este CPF já possui cadastro." : error.message);
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Admin: lista, detalhe e edição de usuários
// ---------------------------------------------------------------------
export const FILTROS_USUARIOS = [
  "todos",
  "ativos",
  "vencendo",
  "vencidos",
  "sem_plano",
  "incompletos",
  "admins",
] as const;
export type FiltroUsuarios = (typeof FILTROS_USUARIOS)[number];

export const listarUsuarios = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        busca: z.string().max(120).optional(),
        filtro: z.enum(FILTROS_USUARIOS).default("todos"),
        pagina: z.number().int().min(0).default(0),
        porPagina: z.number().int().min(10).max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const busca = data.busca?.trim();
    const { data: rows, error } = await supabaseAdmin.rpc("admin_listar_usuarios", {
      ...(busca ? { p_busca: busca } : {}),
      p_filtro: data.filtro,
      p_limite: data.porPagina,
      p_offset: data.pagina * data.porPagina,
    });
    if (error) throw new Error(error.message);
    const lista = rows ?? [];
    return {
      usuarios: lista.map((linha) => {
        const { total, ...usuario } = linha;
        void total;
        return usuario;
      }),
      total: Number(lista[0]?.total ?? 0),
    };
  });

export const detalheUsuario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const [{ data: perfil, error }, { data: auth }, admin, { data: simulados }] = await Promise.all(
      [
        supabaseAdmin
          .from("profiles")
          .select(
            "id, nome_completo, full_name, username, email, cpf, cpf_hash, cnpj, instituicao, plano, plano_validade, cadastro_completo_em, created_at",
          )
          .eq("id", data.userId)
          .maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(data.userId),
        ehAdmin(supabaseAdmin, data.userId),
        supabaseAdmin
          .from("simulados")
          .select("id, tipo, status, iniciado_em, acertos, total_questoes, aprovado")
          .eq("user_id", data.userId)
          .order("iniciado_em", { ascending: false })
          .limit(10),
      ],
    );
    if (error) throw new Error(error.message);
    if (!perfil) throw new Error("Usuário não encontrado.");

    let gratuidadeUsada = false;
    if (perfil.cpf_hash) {
      const { data: usada } = await supabaseAdmin
        .from("gratuidade_usada")
        .select("usada_em")
        .eq("cpf_hash", perfil.cpf_hash)
        .maybeSingle();
      gratuidadeUsada = Boolean(usada);
    }

    const u = auth?.user;
    const provedores = (u?.app_metadata?.["providers"] as string[] | undefined) ?? [
      (u?.app_metadata?.["provider"] as string | undefined) ?? "email",
    ];

    return {
      id: perfil.id,
      nome: perfil.nome_completo ?? perfil.full_name ?? perfil.username ?? "",
      email: perfil.email ?? u?.email ?? null,
      cpf: perfil.cpf,
      cnpj: perfil.cnpj,
      instituicao: perfil.instituicao,
      plano: perfil.plano,
      planoValidade: perfil.plano_validade,
      acessoAtivo: acessoAtivo(perfil.plano, perfil.plano_validade),
      cadastroCompleto: Boolean(perfil.cadastro_completo_em && perfil.cpf),
      cadastroCompletoEm: perfil.cadastro_completo_em,
      criadoEm: perfil.created_at,
      ultimoAcesso: u?.last_sign_in_at ?? null,
      emailConfirmado: Boolean(u?.email_confirmed_at),
      provedores,
      isAdmin: admin,
      gratuidadeUsada,
      simulados: simulados ?? [],
    };
  });

export const atualizarCadastroUsuario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    dadosCadastroSchema.extend({ token: tokenSchema, userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const cpfHash = await hashCpf(data.cpf, salCpf());
    if (await cpfEmUso(supabaseAdmin, data.cpf, cpfHash, data.userId)) {
      throw new Error("Este CPF já está cadastrado em outra conta.");
    }
    const { data: atual } = await supabaseAdmin
      .from("profiles")
      .select("cadastro_completo_em")
      .eq("id", data.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        nome_completo: data.nome,
        full_name: data.nome,
        cpf: data.cpf,
        cpf_hash: cpfHash,
        cnpj: data.cnpj,
        instituicao: data.instituicao,
        cadastro_completo_em: atual?.cadastro_completo_em ?? new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const atualizarPlano = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        userId: z.string().uuid(),
        plano: z.enum(PLANOS),
        validade: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
          .nullable()
          .optional(),
      })
      .superRefine((v, ctx) => {
        if ((PLANOS_PAGOS as readonly string[]).includes(v.plano) && !v.validade) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Informe até quando o acesso é válido.",
            path: ["validade"],
          });
        }
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const pago = (PLANOS_PAGOS as readonly string[]).includes(data.plano);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plano: data.plano, plano_validade: pago ? (data.validade ?? null) : null })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
