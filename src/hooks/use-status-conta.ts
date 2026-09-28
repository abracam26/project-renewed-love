import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseSession } from "@/hooks/use-session";
import { statusConta } from "@/lib/usuarios.functions";

/**
 * Situação da conta logada: cadastro completo, papel de admin e plano.
 * Usado pelo AppShell (cadastro obrigatório e aviso de senha).
 */
export function useStatusConta() {
  const { session, loading: sessionLoading } = useSupabaseSession();
  const carregar = useServerFn(statusConta);
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;

  const query = useQuery({
    queryKey: ["status-conta", userId],
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    session,
    token,
    loading: sessionLoading || (Boolean(token) && query.isPending),
    status: query.data ?? null,
    erro: query.error instanceof Error ? query.error.message : null,
  };
}
