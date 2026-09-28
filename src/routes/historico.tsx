import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, CheckCircle2, Eye, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useToken } from "@/hooks/use-token";
import { historicoAluno } from "@/lib/simulado.functions";

export const Route = createFileRoute("/historico")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Histórico de Simulados — Simulador ABT" },
      {
        name: "description",
        content: "Veja todos os simulados realizados com pontuação, acertos e erros.",
      },
    ],
  }),
  component: Historico,
});

function fmtDur(seg: number | null) {
  if (!seg) return "—";
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

function Historico() {
  const { token, loading } = useToken();
  const listar = useServerFn(historicoAluno);
  const query = useQuery({
    queryKey: ["historico-aluno", token],
    queryFn: () => listar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  const simulados = query.data?.simulados ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Histórico de Simulados</h1>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw
            className={`size-3.5 text-primary ${query.isFetching ? "animate-spin" : ""}`}
          />
          Atualizar
        </button>
      </div>

      {loading || query.isPending ? (
        <div className="flex justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : query.isError ? (
        <div className="panel p-6 text-center text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Falha ao carregar."}
        </div>
      ) : simulados.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted-foreground">Você ainda não realizou nenhum simulado.</p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold"
          >
            Iniciar simulado
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {simulados.map((s) => {
            const pct =
              s.total_questoes > 0 ? Math.round((100 * (s.acertos ?? 0)) / s.total_questoes) : 0;
            const erros = s.total_questoes - (s.acertos ?? 0);
            const statusLabel =
              s.status === "em_andamento"
                ? "Em andamento"
                : s.status === "abandonado"
                  ? "Abandonado"
                  : s.aprovado
                    ? "APROVADO"
                    : "REPROVADO";
            return (
              <li key={s.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
                    {s.status === "finalizado" && s.aprovado && (
                      <CheckCircle2 className="size-4 text-success" />
                    )}
                    {s.status === "finalizado" && !s.aprovado && (
                      <XCircle className="size-4 text-destructive" />
                    )}
                    Simulado {s.tipo} — {statusLabel}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      s.status === "em_andamento"
                        ? "bg-info/15 text-info"
                        : s.status === "abandonado"
                          ? "bg-muted text-muted-foreground"
                          : s.aprovado
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
                  <div>
                    <p className="text-lg font-bold text-info">{pct}%</p>
                    <p className="text-xs text-muted-foreground">Pontuação</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-success">{s.acertos ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Acertos</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-destructive">{erros}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-card-foreground">{s.total_questoes}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3.5" />
                    {new Date(s.iniciado_em).toLocaleString("pt-BR")} · Duração{" "}
                    {fmtDur(s.duracao_segundos)}
                  </p>
                  {s.status === "em_andamento" ? (
                    <Link
                      to="/prova/$id"
                      params={{ id: s.id }}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold"
                    >
                      Retomar
                    </Link>
                  ) : s.status === "finalizado" ? (
                    <Link
                      to="/resultado/$id"
                      params={{ id: s.id }}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-accent"
                    >
                      <Eye className="size-3.5" />
                      Ver detalhes
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
