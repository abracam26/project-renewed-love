import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Loader2,
  Play,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useToken } from "@/hooks/use-token";
import { CadastroCpf } from "@/components/CadastroCpf";
import { SelecaoSimulado } from "@/components/SelecaoSimulado";
import { dashboardAluno } from "@/lib/simulado.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Simulador ABT" },
      {
        name: "description",
        content: "Acompanhe seus simulados, taxa de aprovação e histórico de estudo.",
      },
      { property: "og:title", content: "Dashboard — Simulador ABT" },
      { property: "og:description", content: "Seu painel de preparação para a certificação ABT." },
    ],
  }),
  component: Dashboard,
});

function fmtTempoTotal(seg: number) {
  if (seg === 0) return "0min";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="panel p-5">
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-2xl font-bold text-card-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Dashboard() {
  const { token, loading: tokenLoading } = useToken();
  const carregar = useServerFn(dashboardAluno);

  const query = useQuery({
    queryKey: ["dashboard", token],
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  if (tokenLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!token) {
    return (
      <div className="panel p-8 text-center">
        <h2 className="text-lg font-semibold text-card-foreground">
          Faça login para acessar o simulador
        </h2>
        <Link
          to="/auth"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold"
        >
          Entrar
        </Link>
        <p className="mt-6 text-xs text-muted-foreground">
          <Link to="/termos" className="hover:text-primary">
            Termos de Uso
          </Link>
          <span className="mx-2">·</span>
          <Link to="/privacidade" className="hover:text-primary">
            Política de Privacidade
          </Link>
        </p>
      </div>
    );
  }

  const d = query.data;
  const nome = d?.perfil.username ?? d?.perfil.full_name ?? "aluno";
  const taxa =
    d && d.stats.simulados_completos > 0
      ? Math.round((100 * d.stats.aprovados) / d.stats.simulados_completos)
      : 0;

  return (
    <div className="space-y-6">
      <section className="gold-banner rounded-lg px-6 py-5">
        <h1 className="text-xl font-bold">Olá, {nome}! 👋</h1>
        <p className="mt-1 text-sm opacity-90">
          {d?.emAndamento
            ? "Você tem um simulado em andamento. Retome quando quiser."
            : "Bem-vindo ao seu painel. Continue se preparando para o exame."}
        </p>
      </section>

      {query.isPending ? (
        <div className="flex justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : query.isError ? (
        <div className="panel p-6 text-center text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Falha ao carregar."}
        </div>
      ) : d ? (
        <>
          {d.emAndamento && (
            <div className="panel flex flex-wrap items-center justify-between gap-3 border-info/50 p-4">
              <p className="text-sm">
                <Play className="mr-2 inline size-4 text-primary" />
                Simulado {d.emAndamento.tipo} iniciado em{" "}
                {new Date(d.emAndamento.iniciado_em).toLocaleString("pt-BR")}
              </p>
              <Link
                to="/prova/$id"
                params={{ id: d.emAndamento.id }}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-gold"
              >
                Retomar
              </Link>
            </div>
          )}

          {!d.perfil.temCpf && <CadastroCpf token={token} />}

          <SelecaoSimulado
            token={token}
            temCpf={d.perfil.temCpf}
            simuladoEmAndamentoId={d.emAndamento?.id ?? null}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={BookOpen}
              value={String(d.stats.total_simulados)}
              label="Simulados realizados"
            />
            <StatCard icon={Award} value={`${taxa}%`} label="Taxa de aprovação" />
            <StatCard icon={TrendingUp} value={`${d.stats.melhor_pct}%`} label="Melhor pontuação" />
            <StatCard
              icon={HelpCircle}
              value={String(d.stats.total_questoes)}
              label="Questões respondidas"
            />
            <StatCard
              icon={Clock}
              value={fmtTempoTotal(d.stats.tempo_total_seg)}
              label="Tempo estudado"
            />
            <StatCard icon={Target} value={`${d.stats.media_pct}%`} label="Pontuação média" />
          </div>

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
              <Trophy className="size-4 text-primary" />
              Simulados recentes
            </h2>
            {d.recentes.length === 0 ? (
              <p className="mt-4 rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum simulado finalizado ainda. Comece pelo teste grátis ou por um simulado ABT1.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {d.recentes.map((s) => {
                  const pct =
                    s.total_questoes > 0
                      ? Math.round((100 * (s.acertos ?? 0)) / s.total_questoes)
                      : 0;
                  return (
                    <li key={s.id}>
                      <Link
                        to="/resultado/$id"
                        params={{ id: s.id }}
                        className="flex items-center gap-3 rounded-md bg-secondary px-4 py-3 transition-colors hover:bg-accent"
                      >
                        {s.aprovado ? (
                          <CheckCircle2 className="size-5 shrink-0 text-success" />
                        ) : (
                          <XCircle className="size-5 shrink-0 text-destructive" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-card-foreground">
                            Simulado {s.tipo} em{" "}
                            {new Date(s.iniciado_em).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {s.acertos ?? 0} de {s.total_questoes} ({pct}%)
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 text-right">
              <Link to="/historico" className="text-xs font-medium text-primary hover:underline">
                Ver todos →
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
