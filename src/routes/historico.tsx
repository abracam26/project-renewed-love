import { createFileRoute } from "@tanstack/react-router";
import { Calendar, CheckCircle2, Eye, RefreshCw, XCircle } from "lucide-react";
import { currentUser, scorePercent, simulados } from "@/lib/mock-data";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de Simulados — Simulador ABT" },
      { name: "description", content: "Veja todos os simulados realizados com pontuação, acertos e erros." },
      { property: "og:title", content: "Histórico de Simulados — Simulador ABT" },
      { property: "og:description", content: "Todo o seu histórico de simulados em um só lugar." },
    ],
  }),
  component: Historico,
});

function Historico() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Histórico de Simulados</h1>
        <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground transition-colors hover:bg-accent">
          <RefreshCw className="size-3.5 text-primary" />
          Atualizar
        </button>
      </div>

      <div className="rounded-lg border border-info/30 bg-info/10 p-4 text-xs leading-relaxed text-foreground">
        <p className="font-semibold">Status:</p>
        <p>
          <span className="font-semibold">Usuário:</span> <span className="text-info">{currentUser.email}</span>
        </p>
        <p>
          <span className="font-semibold">ID:</span> <span className="text-info">{currentUser.id}</span>
        </p>
        <p>
          <span className="font-semibold">Simulados encontrados:</span>{" "}
          <span className="text-info">{simulados.length}</span>
        </p>
        <p>
          <span className="font-semibold">Última busca:</span> <span className="text-info">23/08/2026, 22:40:28</span>
        </p>
      </div>

      <ul className="space-y-4">
        {simulados.map((s) => {
          const pct = scorePercent(s);
          const erros = s.total - s.acertos;
          return (
            <li key={s.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
                  {s.aprovado ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <XCircle className="size-4 text-destructive" />
                  )}
                  {s.titulo} — {s.aprovado ? "APROVADO" : "REPROVADO"}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    s.aprovado ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {s.aprovado ? "Aprovado" : "Insuficiente"}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
                <div>
                  <p className="text-lg font-bold text-info">{pct}%</p>
                  <p className="text-xs text-muted-foreground">Pontuação</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-success">{s.acertos}</p>
                  <p className="text-xs text-muted-foreground">Acertos</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-destructive">{erros}</p>
                  <p className="text-xs text-muted-foreground">Erros</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-card-foreground">{s.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" />
                  {s.data}
                </p>
                <button className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-accent">
                  <Eye className="size-3.5" />
                  Ver Detalhes
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
