import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Clock, TrendingUp, Trophy, XCircle, AlertCircle } from "lucide-react";
import { relatorios } from "@/lib/mock-data";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de Desempenho — Simulador ABT" },
      { name: "description", content: "Média geral, melhor performance, status de certificação e ranking de usuários." },
      { property: "og:title", content: "Relatórios de Desempenho — Simulador ABT" },
      { property: "og:description", content: "Analise sua evolução e o que falta para a aprovação." },
    ],
  }),
  component: Relatorios,
});

function Relatorios() {
  const r = relatorios;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Melhor Performance</p>
          <p className="mt-2 flex items-center gap-2 text-xl font-bold text-card-foreground">
            <BarChart3 className="size-4 text-info" />
            {r.melhorPerformance.pct}%
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{r.melhorPerformance.detalhe}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Média Geral</p>
          <p className="mt-2 flex items-center gap-2 text-xl font-bold text-card-foreground">
            <TrendingUp className="size-4 text-success" />
            {r.mediaGeral.pct}%
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{r.mediaGeral.detalhe}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Status Certificação</p>
          <p className="mt-2 flex items-center gap-2 text-xl font-bold text-destructive">
            <XCircle className="size-4" />
            {r.statusCertificacao.label}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{r.statusCertificacao.detalhe}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Tempo Médio</p>
          <p className="mt-2 flex items-center gap-2 text-xl font-bold text-card-foreground">
            <Clock className="size-4 text-primary" />
            {r.tempoMedio.label}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{r.tempoMedio.detalhe}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Trophy className="size-4 text-primary" />
            Ranking de Usuários — Top 10
          </h2>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <AlertCircle className="size-7 text-muted-foreground" />
            <p className="mt-4 text-sm text-card-foreground">Nenhum usuário no ranking</p>
            <p className="mt-2 text-xs text-muted-foreground">
              O ranking será exibido quando usuários optarem por participar completarem simulados.
            </p>
          </div>
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="text-base font-semibold text-card-foreground">Seus Simulados</h2>

          <div className="rounded-md border border-info/30 bg-info/10 p-4 text-xs">
            <p className="font-semibold text-info">Seus Resultados:</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ul className="space-y-1 text-foreground">
                <li>
                  <span className="font-semibold">Total de simulados:</span> {r.resumo.totalSimulados}
                </li>
                <li>
                  <span className="font-semibold">Testes gratuitos:</span> {r.resumo.testesGratuitos}
                </li>
                <li>
                  <span className="font-semibold">Simulados completos:</span> {r.resumo.simuladosCompletos}
                </li>
              </ul>
              <ul className="space-y-1 text-foreground">
                <li>
                  <span className="font-semibold">Melhor resultado:</span> {r.resumo.melhorResultado}
                </li>
                <li>
                  <span className="font-semibold">Média geral:</span> {r.resumo.mediaGeral}
                </li>
                <li>
                  <span className="font-semibold">Tempo médio:</span> {r.resumo.tempoMedio}
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-xs text-foreground">
            <p className="font-semibold text-destructive">Continue praticando!</p>
            <p className="mt-2">
              Sua melhor pontuação foi de <span className="font-semibold">50%</span> (20 acertos de 40).
            </p>
            <p className="mt-1">
              Você precisa de mais <span className="font-semibold">8 acertos</span> para atingir a meta de aprovação
              (70%).
            </p>
          </div>

          <div className="rounded-md border border-border bg-secondary p-4 text-xs text-card-foreground">
            <p className="font-semibold">Critérios de Aprovação:</p>
            <ul className="mt-2 space-y-1">
              <li>• <span className="font-semibold">40 questões</span> objetivas de múltipla escolha</li>
              <li>• <span className="font-semibold">4 alternativas</span> por questão (apenas 1 correta)</li>
              <li>• <span className="font-semibold">Pontuação mínima:</span> 70% de acertos (28 questões)</li>
              <li>• <span className="font-semibold">Tempo limite:</span> 2 horas (120 minutos)</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
