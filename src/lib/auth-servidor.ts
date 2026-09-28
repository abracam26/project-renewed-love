import { z } from "zod";

/**
 * Utilitários comuns das funções de servidor: cliente com service_role,
 * usuário do token e checagem do papel de admin.
 */

export const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

export async function servidor() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type SupabaseAdmin = Awaited<ReturnType<typeof servidor>>;

export async function usuarioLogado(token: string) {
  const supabaseAdmin = await servidor();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return { supabaseAdmin, user: data.user };
}

export async function ehAdmin(supabaseAdmin: SupabaseAdmin, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

export async function exigirAdmin(token: string) {
  const { supabaseAdmin, user } = await usuarioLogado(token);
  if (!(await ehAdmin(supabaseAdmin, user.id))) {
    throw new Error("Acesso restrito a administradores.");
  }
  return { supabaseAdmin, user };
}

/** "Ana Maria Souza" -> "Ana S." (usado no ranking, para não expor o nome completo). */
export function abreviarNome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Aluno";
  const primeiro = partes[0]!;
  if (partes.length === 1) return primeiro;
  const ultimo = partes[partes.length - 1]!;
  return `${primeiro} ${ultimo.charAt(0).toUpperCase()}.`;
}
