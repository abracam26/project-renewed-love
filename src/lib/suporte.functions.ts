import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, usuarioLogado } from "@/lib/auth-servidor";
import {
  CATEGORIAS_CHAMADO,
  LIMITE_CHAMADOS_DIA,
  STATUS_CHAMADO,
  type CategoriaChamado,
  type StatusChamado,
} from "@/lib/suporte";

/**
 * Chamados de suporte: o aluno abre pela página Suporte e acompanha a
 * resposta ali; o admin responde em /admin/suporte.
 */

type Chamado = {
  id: string;
  categoria: CategoriaChamado;
  titulo: string;
  mensagem: string;
  status: StatusChamado;
  resposta: string | null;
  respondido_em: string | null;
  created_at: string;
};

const CAMPOS = "id, categoria, titulo, mensagem, status, resposta, respondido_em, created_at";

// ---------------------------------------------------------------------
// Aluno
// ---------------------------------------------------------------------
export const abrirChamado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        categoria: z.enum(CATEGORIAS_CHAMADO, {
          errorMap: () => ({ message: "Escolha uma categoria." }),
        }),
        titulo: z
          .string()
          .trim()
          .min(3, "Escreva um título curto para o chamado.")
          .max(150, "Título muito longo."),
        mensagem: z
          .string()
          .trim()
          .min(10, "Descreva o problema com um pouco mais de detalhe.")
          .max(5000, "Mensagem muito longa."),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);

    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("chamados_suporte")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", desde);
    if ((count ?? 0) >= LIMITE_CHAMADOS_DIA) {
      throw new Error(
        `Você já abriu ${LIMITE_CHAMADOS_DIA} chamados nas últimas 24 horas. Aguarde a resposta dos anteriores.`,
      );
    }

    const { error } = await supabaseAdmin.from("chamados_suporte").insert({
      user_id: user.id,
      categoria: data.categoria,
      titulo: data.titulo,
      mensagem: data.mensagem,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const meusChamados = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("chamados_suporte")
      .select(CAMPOS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Chamado[]>();
    if (error) throw new Error(error.message);
    return { chamados: rows ?? [] };
  });

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------
export type ChamadoAdmin = Chamado & {
  autor: { nome: string | null; email: string | null } | null;
};

export const listarChamados = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        status: z.enum([...STATUS_CHAMADO, "todos"]).default("aberto"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);

    let consulta = supabaseAdmin
      .from("chamados_suporte")
      .select(`${CAMPOS}, user_id`)
      .order("created_at", { ascending: data.status === "aberto" })
      .limit(200);
    if (data.status !== "todos") consulta = consulta.eq("status", data.status);

    const [{ data: rows, error }, ...contagens] = await Promise.all([
      consulta.returns<(Chamado & { user_id: string })[]>(),
      ...STATUS_CHAMADO.map((s) =>
        supabaseAdmin
          .from("chamados_suporte")
          .select("id", { count: "exact", head: true })
          .eq("status", s),
      ),
    ]);
    if (error) throw new Error(error.message);

    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const autores = new Map<string, { nome: string | null; email: string | null }>();
    if (ids.length > 0) {
      const { data: perfis } = await supabaseAdmin
        .from("profiles")
        .select("id, nome_completo, full_name, username, email")
        .in("id", ids);
      for (const p of perfis ?? []) {
        autores.set(p.id, {
          nome: p.nome_completo ?? p.full_name ?? p.username,
          email: p.email ?? null,
        });
      }
    }

    const chamados: ChamadoAdmin[] = (rows ?? []).map(({ user_id, ...c }) => ({
      ...c,
      autor: autores.get(user_id) ?? null,
    }));
    const totais = Object.fromEntries(
      STATUS_CHAMADO.map((s, i) => [s, contagens[i]?.count ?? 0]),
    ) as Record<StatusChamado, number>;
    return { chamados, totais };
  });

export const responderChamado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        id: z.string().uuid(),
        resposta: z.string().trim().min(2, "Escreva a resposta.").max(5000),
        encerrar: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin
      .from("chamados_suporte")
      .update({
        resposta: data.resposta,
        status: data.encerrar ? "fechado" : "respondido",
        respondido_em: new Date().toISOString(),
        respondido_por: user.id,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const alterarStatusChamado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: tokenSchema, id: z.string().uuid(), status: z.enum(STATUS_CHAMADO) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin
      .from("chamados_suporte")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
