import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Configurações por tipo de prova, editáveis pelo administrador.
 * Percentuais de tema/dificuldade, nota de corte, tempo e o flag de
 * visibilidade da explicação nascem na migração; esta camada permite ajustar.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");
const TIPOS = ["ABT1", "ABT2", "GRATIS", "LIVRE"] as const;

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

export const listarConfiguracoesProva = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("configuracoes_prova")
      .select("*")
      .order("tipo");
    if (error) throw new Error(error.message);
    return { configs: rows ?? [] };
  });

const salvarSchema = z
  .object({
    token: tokenSchema,
    tipo: z.enum(TIPOS),
    total_questoes: z.number().int().min(1).max(200),
    tempo_maximo_min: z.number().int().min(1).max(600),
    nota_corte: z.number().int().min(0).max(100),
    pct_facil: z.number().int().min(0).max(100),
    pct_media: z.number().int().min(0).max(100),
    pct_dificil: z.number().int().min(0).max(100),
    pct_tema_1: z.number().int().min(0).max(100),
    pct_tema_2: z.number().int().min(0).max(100),
    pct_tema_3: z.number().int().min(0).max(100),
    pct_tema_4: z.number().int().min(0).max(100),
    mostrar_explicacao: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.pct_facil + v.pct_media + v.pct_dificil !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Os percentuais de dificuldade precisam somar 100.",
        path: ["pct_facil"],
      });
    }
    if (v.pct_tema_1 + v.pct_tema_2 + v.pct_tema_3 + v.pct_tema_4 !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Os percentuais por tema precisam somar 100.",
        path: ["pct_tema_1"],
      });
    }
  });

export const salvarConfiguracaoProva = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { token: _token, ...campos } = data;
    void _token;
    const { error } = await supabaseAdmin
      .from("configuracoes_prova")
      .update({ ...campos, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("tipo", data.tipo);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
