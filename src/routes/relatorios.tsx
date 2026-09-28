import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  BarChart3,
  Clock,
  Loader2,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import { TEMAS } from "@/lib/questoes-schema";
import { relatorioAluno } from "@/lib/relatorios.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/relatorios")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Relatórios — Simulador ABT" },
      {
        name: "description",
        content: "Seu desempenho por tema e dificuldade, evolução e ranking de alunos.",
      },
    ],
  }),
  component: Relatorios,
});

const DIFICULDADE_LABEL = { facil: "Fáceis", media: "Médias", dificil: "Difíceis" } as const;

function fmtDuracao(seg: number) {
  if (seg <= 0) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function fmtPct(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function Cartao({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  detalhe: string;
  cor?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-2 flex items-center gap-2 text-xl font-bold text-card-foreground", cor)}>
        <Icone className="size-5 shrink-0" />
        {valor}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detalhe}</p>
    </div>
  );
}

function Barra({
  rotulo,
  pct,
  detalhe,
  destaque,
}: {
  rotulo: string;
  pct: number;
  detalhe: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn("font-medium text-card-foreground", destaque && "text-destructive")}>
          {rotulo}
        </span>
        <span className="text-muted-foreground">
          {detalhe} · <strong className="text-card-foreground">{fmtPct(pct)}</strong>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 70 ? "bg-success" : pct >= 50 ? "bg-primary" : "bg-destructive",
          )}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

function Relatorios() {
  const { token, loading } = useToken();
  const carregar = useServerFn(relatorioAluno);
  const query = useQuery({
    queryKey: ["relatorio-aluno", token],
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  if (loading || query.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Montando seu relatório...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="panel p-6 text-center text-sm text-destructive">
        {mensagemErro(query.error)}
      </div>
    );
  }

  const { resumo, temas, dificuldades, temaMaisFraco, evolucao, ranking } = query.data;
  const semDados = resumo.finalizados === 0;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>

      {semDados ? (
        <div className="panel p-8 text-center">
          <BarChart3 className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm text-card-foreground">
            Você ainda não finalizou nenhum simulado. Seus números aparecem aqui assim que você
            concluir o primeiro.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold"
          >
            Iniciar um simulado
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cartao
              icone={TrendingUp}
              rotulo="Melhor desempenho"
              valor={resumo.melhor ? fmtPct(resumo.melhor.pct) : "—"}
              detalhe={
                resumo.melhor
                  ? `${resumo.melhor.acertos}/${resumo.melhor.total} acertos · ${resumo.melhor.tipo}`
                  : ""
              }
            />
            <Cartao
              icone={Target}
              rotulo="Média geral"
              valor={fmtPct(resumo.media)}
              detalhe={`${resumo.finalizados} simulado${resumo.finalizados === 1 ? "" : "s"} finalizado${resumo.finalizados === 1 ? "" : "s"}`}
            />
            {resumo.ultimoCompleto ? (
              <Cartao
                icone={resumo.ultimoCompleto.aprovado ? Trophy : AlertCircle}
                rotulo={`Último simulado ${resumo.ultimoCompleto.tipo}`}
                valor={resumo.ultimoCompleto.aprovado ? "APROVADO" : "REPROVADO"}
                detalhe={`${fmtPct(resumo.ultimoCompleto.pct)} · meta ${resumo.ultimoCompleto.notaCorte}%`}
                cor={resumo.ultimoCompleto.aprovado ? "text-success" : "text-destructive"}
              />
            ) : (
              <Cartao
                icone={AlertCircle}
                rotulo="Simulado ABT1 ou ABT2"
                valor="Nenhum ainda"
                detalhe="Faça um simulado completo para medir sua aprovação."
              />
            )}
            <Cartao
              icone={Clock}
              rotulo="Tempo médio por simulado"
              valor={fmtDuracao(resumo.tempoMedioSimuladoSeg)}
              detalhe={`${fmtDuracao(resumo.tempoMedioQuestaoSeg)} por questão`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel space-y-4 p-5">
              <h2 className="text-base font-semibold text-card-foreground">Desempenho por tema</h2>
              {temas.map((t) => (
                <Barra
                  key={t.tema}
                  rotulo={`Tema ${t.tema} · ${TEMAS[t.tema as 1 | 2 | 3 | 4]}`}
                  pct={t.pct}
                  detalhe={`${t.acertos}/${t.total}`}
                  destaque={temaMaisFraco?.tema === t.tema}
                />
              ))}
              {temaMaisFraco && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-card-foreground">
                  Seu ponto mais fraco é o <strong>Tema {temaMaisFraco.tema}</strong> (
                  {TEMAS[temaMaisFraco.tema as 1 | 2 | 3 | 4]}), com {fmtPct(temaMaisFraco.pct)} de
                  acerto. Vale revisar esse capítulo do Material de Apoio.
                </p>
              )}
            </section>

            <section className="panel space-y-4 p-5">
              <h2 className="text-base font-semibold text-card-foreground">
                Desempenho por dificuldade
              </h2>
              {dificuldades.map((d) => (
                <Barra
                  key={d.dificuldade}
                  rotulo={`Questões ${DIFICULDADE_LABEL[d.dificuldade].toLowerCase()}`}
                  pct={d.pct}
                  detalhe={`${d.acertos}/${d.total}`}
                />
              ))}
              <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
                <div>
                  <p className="text-lg font-bold text-card-foreground">{resumo.completos}</p>
                  <p className="text-muted-foreground">ABT1/ABT2</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-card-foreground">{resumo.abt}</p>
                  <p className="text-muted-foreground">ABT Corresp.</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-card-foreground">{resumo.gratis}</p>
                  <p className="text-muted-foreground">Teste grátis</p>
                </div>
              </div>
            </section>
          </div>

          <section className="panel p-5">
            <h2 className="text-base font-semibold text-card-foreground">
              Evolução nos últimos simulados
            </h2>
            <div className="mt-4 flex h-40 items-end gap-2">
              {evolucao.map((s) => (
                <div key={s.id} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-card-foreground">
                    {Math.round(s.pct)}%
                  </span>
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div
                      className={cn(
                        "w-full max-w-10 rounded-t",
                        s.pct >= s.notaCorte ? "bg-success" : "bg-destructive/80",
                      )}
                      style={{ height: `${Math.max(4, s.pct)}%` }}
                      title={`${s.tipo} · ${s.data ? new Date(s.data).toLocaleDateString("pt-BR") : ""}`}
                    />
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground">{s.tipo}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Do mais antigo (esquerda) para o mais recente (direita). Verde: atingiu a nota mínima
              daquele simulado.
            </p>
          </section>
        </>
      )}

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
          <Trophy className="size-4 text-primary" />
          Ranking de alunos — Top 10
        </h2>
        <p className="text-xs text-muted-foreground">
          Média nos simulados ABT1 e ABT2 dos últimos {ranking.dias} dias. Só aparece quem escolheu
          participar, com o primeiro nome e a inicial do sobrenome.
        </p>

        {ranking.top.length === 0 ? (
          <p className="mt-4 rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Ainda não há alunos no ranking deste período.
          </p>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {ranking.top.map((r) => (
              <li
                key={`${r.posicao}-${r.nome}-${r.media}`}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                  r.voce ? "border border-primary bg-primary/10" : "bg-secondary/40",
                )}
              >
                <span className="w-7 text-center font-bold text-primary">{r.posicao}º</span>
                <span className="min-w-0 flex-1 truncate font-medium text-card-foreground">
                  {r.nome}
                  {r.voce && <span className="ml-2 text-xs text-primary">(você)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.simulados} simulado{r.simulados === 1 ? "" : "s"}
                </span>
                <span className="w-14 text-right font-semibold text-card-foreground">
                  {fmtPct(r.media)}
                </span>
              </li>
            ))}
          </ol>
        )}

        {ranking.minhaPosicao && !ranking.top.some((r) => r.voce) && (
          <p className="mt-3 text-xs text-card-foreground">
            Sua posição: <strong>{ranking.minhaPosicao.posicao}º</strong> de {ranking.participantes}
            , com média de {fmtPct(ranking.minhaPosicao.media)}.
          </p>
        )}
        {!ranking.participa && (
          <p className="mt-3 text-xs text-muted-foreground">
            Você não participa do ranking. Para aparecer, ative a opção na página{" "}
            <Link to="/perfil" className="font-medium text-primary hover:underline">
              Perfil
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
