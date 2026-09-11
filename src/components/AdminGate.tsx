import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useAdmin } from "@/hooks/use-admin";

/**
 * Bloqueia o conteúdo administrativo para quem não tem o papel "admin".
 * Renderiza o filho apenas quando o servidor confirmou o papel.
 */
export function AdminGate({ children }: { children: (ctx: { token: string }) => ReactNode }) {
  const { token, loading, isAdmin, email, existeAlgumAdmin, erro } = useAdmin();

  if (loading) {
    return (
      <div className="panel flex items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Verificando permissões...
      </div>
    );
  }

  if (!token) {
    return (
      <div className="panel p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          Faça login para acessar a administração
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é restrita a administradores da plataforma.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
        >
          Entrar
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="panel p-8">
        <div className="text-center">
          <ShieldAlert className="mx-auto size-8 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold text-card-foreground">
            Acesso restrito a administradores
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A conta <span className="font-medium text-card-foreground">{email}</span> não tem o
            papel de administrador.
          </p>
          {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
        </div>

        {!existeAlgumAdmin && (
          <div className="mt-6 rounded-lg border border-info/30 bg-info/10 p-4 text-xs leading-relaxed text-foreground">
            <p className="font-semibold">Nenhum administrador cadastrado ainda.</p>
            <p className="mt-1">
              Para liberar esta conta, execute no banco (SQL Editor do Supabase ou pelo Lovable):
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-background/60 p-3 font-mono text-[11px]">
              {`insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = '${email ?? "seu@email.com"}'
on conflict do nothing;`}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" />
        Administrador: {email}
      </p>
      {children({ token })}
    </>
  );
}
