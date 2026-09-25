import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import logoAsset from "@/assets/abracam-logo.png.asset.json";
import { ATUALIZACAO_DOCUMENTOS_LEGAIS, CONTROLADOR } from "@/lib/juridico";

/**
 * Layout público das páginas legais (/privacidade e /termos). Fica fora do
 * AppShell e não exige login, porque o Google e os visitantes precisam
 * conseguir ler essas páginas sem conta.
 */
export function PaginaLegal({
  titulo,
  resumo,
  children,
}: {
  titulo: string;
  resumo: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-sidebar px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="Logo ABRACAM"
            className="size-12 shrink-0 rounded-lg bg-white object-contain p-1.5 shadow-panel"
          />
          <span className="font-display text-lg font-bold text-sidebar-foreground">
            Simulador <span className="text-primary">ABT</span>
          </span>
        </header>

        <article className="panel p-6 sm:p-10">
          <h1 className="font-display text-2xl font-bold text-card-foreground sm:text-3xl">
            {titulo}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Última atualização: {ATUALIZACAO_DOCUMENTOS_LEGAIS}
          </p>
          <p className="mt-6 text-sm leading-relaxed text-card-foreground/90">{resumo}</p>
          <div className="mt-8 space-y-8">{children}</div>
        </article>

        <footer className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link to="/termos" className="hover:text-primary">
              Termos de Uso
            </Link>
            <Link to="/privacidade" className="hover:text-primary">
              Política de Privacidade
            </Link>
            <Link to="/auth" className="hover:text-primary">
              Entrar no simulador
            </Link>
          </nav>
          <p>
            {CONTROLADOR.nome} · CNPJ {CONTROLADOR.cnpj}
          </p>
        </footer>
      </div>
    </div>
  );
}

export function Secao({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-base font-bold text-primary sm:text-lg">
        {numero}. {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-card-foreground/90">
        {children}
      </div>
    </section>
  );
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-primary">{children}</ul>;
}

export function Email({ endereco }: { endereco: string }) {
  return (
    <a href={`mailto:${endereco}`} className="font-medium text-primary hover:underline">
      {endereco}
    </a>
  );
}

export function LinkExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary hover:underline"
    >
      {children}
    </a>
  );
}
