import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useToken } from "@/hooks/use-token";
import { resultadoSimulado } from "@/lib/simulado.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/resultado/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Resultado do simulado — Simulador ABT" },
      {
        name: "description",
        content: "Confira a pontuação e a revisão questão a questão do simulado.",
      },
    ],
  }),
  component: Resultado,
});

function fmtTempo(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const d = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${d(h)}h${d(m)}` : `${d(m)}min ${d(s)}s`;
}

function Resultado() {
  const { id } = useParams({ from: "/resultado/$id" });
  const { token, loading } = useToken();
  const carregar = useServerFn(resultadoSimulado);

  const query = useQuery({
    queryKey: ["resultado", id, token],
    queryFn: () => carregar({ data: { token: token as string, simuladoId: id } }),
    enabled: Boolean(token),
  });

  if (loading || !token || query.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Carregando resultado...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="panel p-8 text-center text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Resultado não encontrado."}
      </div>
    );
  }

  const s = query.data.simulado;
  const pct = s.total_questoes > 0 ? Math.round((100 * (s.acertos ?? 0)) / s.total_questoes) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/historico"
          className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ChevronLeft className="size-3.5" /> Ver histórico
        </Link>
        <Link
          to="/"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold"
        >
          Voltar ao painel
        </Link>
      </div>

      <section
        className={cn(
          "panel flex flex-wrap items-center justify-between gap-4 p-6",
          s.aprovado ? "border-success/50" : "border-destructive/50",
        )}
      >
        <div className="flex items-center gap-4">
          {s.aprovado ? (
            <Trophy className="size-10 text-success" />
          ) : (
            <Target className="size-10 text-destructive" />
          )}
          <div>
            <h1 className="text-xl font-bold text-card-foreground">
              {s.aprovado ? "APROVADO" : "REPROVADO"} · Simulado {s.tipo}
            </h1>
            <p className="text-xs text-muted-foreground">
              Nota mínima para aprovação: {s.nota_corte}%.{" "}
              {s.duracao_segundos && `Duração: ${fmtTempo(s.duracao_segundos)}.`}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p
              className={cn("text-3xl font-bold", s.aprovado ? "text-success" : "text-destructive")}
            >
              {pct}%
            </p>
            <p className="text-xs text-muted-foreground">Pontuação</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-success">{s.acertos ?? 0}</p>
            <p className="text-xs text-muted-foreground">Acertos</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-destructive">
              {s.total_questoes - (s.acertos ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">Erros</p>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-card-foreground">Revisão questão a questão</h2>
        {!query.data.mostrarExplicacao && (
          <p className="mt-1 text-xs text-muted-foreground">
            A explicação detalhada será liberada em breve pela ABRACAM.
          </p>
        )}

        <ul className="mt-4 space-y-4">
          {query.data.questoes.map((q, idx) => (
            <li key={idx} className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-start gap-3">
                {q.correta ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    Questão {idx + 1} · Tema {q.tema} · {q.tema_nome}
                    {q.tempo_ms ? (
                      <>
                        <span className="mx-2">·</span>
                        <Clock className="mr-1 inline size-3" />
                        {Math.round(q.tempo_ms / 1000)}s
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-card-foreground">{q.enunciado}</p>

                  <ul className="mt-3 space-y-1.5">
                    {q.alternativas.map((a) => {
                      const eGabarito = a.letra === q.gabarito;
                      const eEscolha = a.letra === q.respostaLetra;
                      return (
                        <li
                          key={a.letra}
                          className={cn(
                            "flex items-start gap-2 rounded-md px-3 py-2 text-xs",
                            eGabarito
                              ? "bg-success/15 text-card-foreground"
                              : eEscolha
                                ? "bg-destructive/15 text-card-foreground"
                                : "text-card-foreground/80",
                          )}
                        >
                          <span className="mt-0.5 font-semibold uppercase">({a.letra})</span>
                          <span>{a.texto}</span>
                          {eGabarito && (
                            <span className="ml-auto text-[10px] font-semibold text-success">
                              GABARITO
                            </span>
                          )}
                          {eEscolha && !eGabarito && (
                            <span className="ml-auto text-[10px] font-semibold text-destructive">
                              SUA RESPOSTA
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Referência ao material: aparece sempre nas questões erradas
                      para o aluno saber onde estudar, independentemente do flag
                      de mostrar_explicacao. */}
                  {q.correta === false && (q.fonte_norma || q.fonte_artigo || q.fonte_pagina) && (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-xs leading-relaxed text-card-foreground">
                      <BookOpen className="mt-0.5 size-4 shrink-0 text-info" />
                      <div>
                        <p className="font-semibold">Onde estudar</p>
                        <p className="mt-0.5">
                          {[
                            q.fonte_norma,
                            q.fonte_artigo,
                            q.fonte_pagina ? `página ${q.fonte_pagina} do Material de Apoio` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  )}

                  {q.explicacao && (
                    <div className="mt-3 rounded-md bg-background/60 p-3 text-xs leading-relaxed text-card-foreground">
                      <p className="mb-1 font-semibold">Explicação</p>
                      {q.explicacao}
                      {(q.fonte_norma || q.fonte_artigo || q.fonte_pagina) && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Fonte:{" "}
                          {[
                            q.fonte_norma,
                            q.fonte_artigo,
                            q.fonte_pagina ? `página ${q.fonte_pagina} do material` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
