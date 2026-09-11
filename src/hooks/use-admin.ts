import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseSession } from "@/hooks/use-session";
import { verificarAdmin } from "@/lib/questoes.functions";

/**
 * Expõe o access token da sessão atual e se o usuário é administrador.
 * O papel é verificado no servidor (tabela user_roles), nunca no navegador.
 */
export function useAdmin() {
  const { session, loading: sessionLoading } = useSupabaseSession();
  const verificar = useServerFn(verificarAdmin);
  const token = session?.access_token ?? null;

  const query = useQuery({
    queryKey: ["admin", "papel", session?.user.id ?? null],
    queryFn: () => verificar({ data: { token: token as string } }),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    token,
    session,
    loading: sessionLoading || (Boolean(token) && query.isPending),
    isAdmin: query.data?.isAdmin ?? false,
    email: query.data?.email ?? session?.user.email ?? null,
    existeAlgumAdmin: query.data?.existeAlgumAdmin ?? true,
    erro: query.error instanceof Error ? query.error.message : null,
  };
}
