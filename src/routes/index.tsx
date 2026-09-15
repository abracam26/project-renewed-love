import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  ChevronRight,
  Clock,
  HelpCircle,
  Play,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { currentUser, dashboardStats, scorePercent, simulados } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Simulador ABT" },
      { name: "description", content: "Acompanhe seus simulados, taxa de aprovação, sequência de estudo e ranking." },
      { property: "og:title", content: "Dashboard — Simulador ABT" },
      { property: "og:description", content: "Seu painel de preparação para a certificação ABT." },
    ],
  }),
  component: Dashboard,
});

function StatCard({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="panel p-5">
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-2xl font-bold text-card-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Dashboard() {
  const recentes = simulados.slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="gold-banner rounded-lg px-6 py-5">
        <h1 className="text-xl font-bold">Olá, {currentUser.username}! 👋</h1>
        <p className="mt-1 text-sm opacity-90">Alteração feita no Lovable. Continue se preparando para seu exame!</p>
      </section>

      <div className="flex justify-center">
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90">
          <Play className="size-4" />
          <Target className="size-4" />
          Iniciar novo simulado
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={BookOpen} value={String(dashboardStats.simulados)} label="Simulados realizados" />
        <StatCard icon={Award} value={`${dashboardStats.taxaAprovacao}%`} label="Taxa de aprovação" />
        <StatCard icon={TrendingUp} value={`${dashboardStats.melhorPontuacao}%`} label="Melhor pontuação" />
        <StatCard icon={HelpCircle} value={String(dashboardStats.questoes)} label="Total de Questões Respondidas" />
        <StatCard icon={Clock} value={dashboardStats.tempoEstudado} label="Tempo estudado" />
        <StatCard icon={Target} value={String(dashboardStats.sequencia)} label="Dias de sequência" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Trophy className="size-4 text-primary" />
            Ranking dos Melhores
          </h2>
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <Trophy className="size-8 text-muted-foreground" />
            <p className="mt-4 text-sm text-card-foreground">Nenhum resultado disponível no ranking</p>
            <p className="mt-2 text-xs text-muted-foreground">Realize simulados para aparecer no ranking</p>
          </div>
          <Link to="/relatorios" className="text-xs font-medium text-primary hover:underline">
            Ver todos os resultados →
          </Link>
        </section>

        <section className="panel p-5">
          <h2 className="text-base font-semibold text-card-foreground">Simulados recentes</h2>
          <ul className="mt-4 space-y-3">
            {recentes.map((s) => (
              <li key={s.id}>
                <Link
                  to="/historico"
                  className="flex items-center gap-3 rounded-md bg-secondary px-4 py-3 transition-colors hover:bg-accent"
                >
                  <XCircle className="size-5 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-card-foreground">
                      {s.titulo} em {s.data.split(",")[0]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {s.acertos} de {s.total} ({scorePercent(s)}%)
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 text-right">
            <Link to="/historico" className="text-xs font-medium text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
