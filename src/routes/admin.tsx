import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, FileUp, Loader2, Settings, Users } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { TrainingUploader } from "@/components/TrainingUploader";
import { PROPORCAO_PROVA, TEMAS } from "@/lib/questoes-schema";
import { resumoQuestoes } from "@/lib/questoes.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administração — Simulador ABT" },
      {
        name: "description",
        content: "Painel administrativo: usuários, banco de questões e importações.",
      },
      { property: "og:title", content: "Administração — Simulador ABT" },
      { property: "og:description", content: "Gerencie usuários e conteúdo da plataforma." },
    ],
  }),
  component: Admin,
});

function Admin() {
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <Settings className="size-6 text-primary" />
        Admin
      </h1>

      <AdminGate>{({ token }) => <PainelAdmin token={token} />}</AdminGate>
    </div>
  );
}

function PainelAdmin({ token }: { token: string }) {
  const resumo = useServerFn(resumoQuestoes);
  const query = useQuery({
    queryKey: ["admin", "resumo"],
    queryFn: () => resumo({ data: { token } }),
  });

  const d = query.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card icone={Users} valor={d ? String(d.usuarios) : null} rotulo="Usuários cadastrados" />
        <Card icone={Database} valor={d ? String(d.total) : null} rotulo="Questões cadastradas" />
        <Card
          icone={Database}
          valor={d ? String(d.ativas) : null}
          rotulo="Questões ativas nos simulados"
        />
        <Card
          icone={FileUp}
          valor={d ? String(d.importacoes.length) : null}
          rotulo="Importações recentes"
        />
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">Cobertura por tema</h2>
            <p className="text-xs text-muted-foreground">
              Questões ativas por tema e quantas cada simulado de 40 questões sorteia.
            </p>
          </div>
          <Link
            to="/admin/questoes"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
          >
            <FileUp className="size-4" />
            Importar e gerenciar questões
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([1, 2, 3, 4] as const).map((t) => {
            const linha = d?.temas.find((x) => x.tema === t);
            const ativas = linha?.ativas ?? 0;
            const porProva = PROPORCAO_PROVA[t];
            const simuladosSemRepetir = Math.floor(ativas / porProva);
            return (
              <div key={t} className="rounded-lg border border-border bg-secondary/40 p-4">
                <p className="text-xs font-medium text-muted-foreground">Tema {t}</p>
                <p className="text-sm font-semibold text-card-foreground">{TEMAS[t]}</p>
                <p className="mt-3 text-2xl font-bold text-card-foreground">{d ? ativas : "–"}</p>
                <p className="text-xs text-muted-foreground">
                  ativas · {linha?.total ?? 0} no total · {porProva} por prova
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {d
                    ? `${simuladosSemRepetir} simulado${simuladosSemRepetir === 1 ? "" : "s"} sem repetir questão`
                    : ""}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-card-foreground">Últimas importações</h2>
        {query.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
          </p>
        ) : !d || d.importacoes.length === 0 ? (
          <p className="mt-3 rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhuma importação realizada ainda.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Arquivo</th>
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Lidas</th>
                  <th className="pb-2 font-medium">Novas</th>
                  <th className="pb-2 font-medium">Atualizadas</th>
                  <th className="pb-2 font-medium">Erros</th>
                </tr>
              </thead>
              <tbody>
                {d.importacoes.map((i) => (
                  <tr key={i.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-card-foreground">
                      {i.arquivo}{" "}
                      <span className="text-xs uppercase text-muted-foreground">({i.formato})</span>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(i.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 text-card-foreground">{i.total_lidas}</td>
                    <td className="py-3 text-success">{i.total_inseridas}</td>
                    <td className="py-3 text-info">{i.total_atualizadas}</td>
                    <td
                      className={`py-3 ${i.total_erros > 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {i.total_erros}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TrainingUploader />
    </div>
  );
}

function Card({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: typeof Users;
  valor: string | null;
  rotulo: string;
}) {
  return (
    <div className="panel p-5">
      <Icone className="size-5 text-primary" />
      <p className="mt-3 text-2xl font-bold text-card-foreground">{valor ?? "–"}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}
