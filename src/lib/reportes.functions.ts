import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { QuestaoRow } from "@/lib/questoes-schema";
import {
  LIMITE_REPORTES_DIA,
  MOTIVOS_REPORTE,
  STATUS_REPORTE,
  type MotivoReporte,
  type StatusReporte,
} from "@/lib/reportes";

/**
 * Reporte de questões: o aluno aponta um problema (gabarito, enunciado,
 * divergência com o material...) e o admin trata em /admin/reportes.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

async function servidor() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function usuarioDoToken(token: string) {
  const supabaseAdmin = await servidor();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return { supabaseAdmin, user: data.user };
}

async function exigirAdmin(token: string) {
  const { supabaseAdmin, user } = await usuarioDoToken(token);
  const { data: papel } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!papel) throw new Error("Acesso restrito a administradores.");
  return { supabaseAdmin, user };
}

// ---------------------------------------------------------------------
// Aluno: reportar uma questão de um simulado dele
// ---------------------------------------------------------------------
export const reportarQuestao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        questaoId: z.string().regex(/^ABT-T[1-4]-\d{3,5}$/, "Questão inválida."),
        simuladoId: z.string().uuid(),
        motivo: z.enum(MOTIVOS_REPORTE),
        descricao: z.string().trim().max(2000, "Descrição muito longa.").default(""),
      })
      .superRefine((v, ctx) => {
        if (v.motivo === "outro" && v.descricao.length < 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Descreva o problema em poucas palavras.",
            path: ["descricao"],
          });
        }
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioDoToken(data.token);

    // A questão precisa ter aparecido num simulado deste aluno
    const { data: vinculo } = await supabaseAdmin
      .from("simulado_questoes")
      .select("id, simulados!inner(user_id)")
      .eq("simulado_id", data.simuladoId)
      .eq("questao_id", data.questaoId)
      .maybeSingle();
    const dono = (vinculo?.simulados as unknown as { user_id: string } | undefined)?.user_id;
    if (!vinculo || dono !== user.id) {
      throw new Error("Questão não encontrada nos seus simulados.");
    }

    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("reportes_questao")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", desde);
    if ((count ?? 0) >= LIMITE_REPORTES_DIA) {
      throw new Error(
        `Você atingiu o limite de ${LIMITE_REPORTES_DIA} reportes em 24 horas. Tente novamente amanhã.`,
      );
    }

    const { error } = await supabaseAdmin.from("reportes_questao").insert({
      questao_id: data.questaoId,
      user_id: user.id,
      simulado_id: data.simuladoId,
      motivo: data.motivo,
      descricao: data.descricao || null,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error("Você já reportou esta questão. A equipe da ABRACAM está analisando.");
      }
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Admin: listar e tratar reportes
// ---------------------------------------------------------------------
export type ReporteAdmin = {
  id: string;
  questao_id: string;
  motivo: MotivoReporte;
  descricao: string | null;
  status: StatusReporte;
  resposta_admin: string | null;
  created_at: string;
  resolvido_em: string | null;
  tipoSimulado: string | null;
  questao: QuestaoRow | null;
  autor: { nome: string | null; email: string | null } | null;
  abertosNaQuestao: number;
};

export const listarReportes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        status: z.enum([...STATUS_REPORTE, "todos"]).default("aberto"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);

    let consulta = supabaseAdmin
      .from("reportes_questao")
      .select(
        "id, questao_id, user_id, motivo, descricao, status, resposta_admin, created_at, resolvido_em, questoes(*), simulados(tipo)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "todos") consulta = consulta.eq("status", data.status);

    const [{ data: rows, error }, { data: abertos }, ...contagens] = await Promise.all([
      consulta.returns<
        {
          id: string;
          questao_id: string;
          user_id: string | null;
          motivo: MotivoReporte;
          descricao: string | null;
          status: StatusReporte;
          resposta_admin: string | null;
          created_at: string;
          resolvido_em: string | null;
          questoes: QuestaoRow | null;
          simulados: { tipo: string } | null;
        }[]
      >(),
      supabaseAdmin.from("reportes_questao").select("questao_id").eq("status", "aberto"),
      ...STATUS_REPORTE.map((s) =>
        supabaseAdmin
          .from("reportes_questao")
          .select("id", { count: "exact", head: true })
          .eq("status", s),
      ),
    ]);
    if (error) throw new Error(error.message);

    const porQuestao = new Map<string, number>();
    for (const r of abertos ?? []) {
      porQuestao.set(r.questao_id, (porQuestao.get(r.questao_id) ?? 0) + 1);
    }

    const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter((v): v is string => !!v))];
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

    const reportes: ReporteAdmin[] = (rows ?? []).map((r) => ({
      id: r.id,
      questao_id: r.questao_id,
      motivo: r.motivo,
      descricao: r.descricao,
      status: r.status,
      resposta_admin: r.resposta_admin,
      created_at: r.created_at,
      resolvido_em: r.resolvido_em,
      tipoSimulado: r.simulados?.tipo ?? null,
      questao: r.questoes,
      autor: r.user_id ? (autores.get(r.user_id) ?? null) : null,
      abertosNaQuestao: porQuestao.get(r.questao_id) ?? 0,
    }));

    const totais = Object.fromEntries(
      STATUS_REPORTE.map((s, i) => [s, contagens[i]?.count ?? 0]),
    ) as Record<StatusReporte, number>;

    return { reportes, totais };
  });

export const atualizarReporte = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        id: z.string().uuid(),
        status: z.enum(STATUS_REPORTE),
        resposta: z.string().trim().max(2000).optional(),
        /** Aplica o mesmo status a todos os reportes abertos da mesma questão. */
        todosDaQuestao: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const encerrado = data.status !== "aberto";
    const campos = {
      status: data.status,
      resposta_admin: data.resposta || null,
      resolvido_em: encerrado ? new Date().toISOString() : null,
      resolvido_por: encerrado ? user.id : null,
    };

    if (data.todosDaQuestao) {
      const { data: rep } = await supabaseAdmin
        .from("reportes_questao")
        .select("questao_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!rep) throw new Error("Reporte não encontrado.");
      const { error } = await supabaseAdmin
        .from("reportes_questao")
        .update(campos)
        .eq("questao_id", rep.questao_id)
        .eq("status", "aberto");
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("reportes_questao")
        .update(campos)
        .eq("id", data.id);
      if (error) {
        if (error.code === "23505") {
          throw new Error("Este aluno já tem outro reporte aberto para a mesma questão.");
        }
        throw new Error(error.message);
      }
    }
    return { ok: true as const };
  });
