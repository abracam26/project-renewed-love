import { useSupabaseSession } from "@/hooks/use-session";

/**
 * Retorna o access token do aluno logado. Se não houver sessão, retorna null.
 * As funções de servidor deste app recebem o token no payload em vez de
 * dependerem exclusivamente do Authorization header.
 */
export function useToken() {
  const { session, loading } = useSupabaseSession();
  return { token: session?.access_token ?? null, session, loading };
}
