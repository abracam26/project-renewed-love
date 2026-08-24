import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CreditCard, ExternalLink, Mail, Trophy, User } from "lucide-react";
import { useState } from "react";
import { currentUser } from "@/lib/mock-data";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — Simulador ABT" },
      { name: "description", content: "Dados da conta, preferências de ranking e status da assinatura." },
      { property: "og:title", content: "Perfil — Simulador ABT" },
      { property: "og:description", content: "Gerencie sua conta no Simulador ABT." },
    ],
  }),
  component: Perfil,
});

function Perfil() {
  const [ranking, setRanking] = useState(currentUser.rankingOptIn);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <User className="size-4 text-primary" />
            Informações Pessoais
          </h2>
          <label className="mt-6 block">
            <span className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
              <Mail className="size-3.5" />
              E-mail
            </span>
            <input
              readOnly
              value={currentUser.email}
              className="mt-2 w-full rounded-md border border-input bg-secondary px-3 py-2.5 text-sm text-card-foreground"
            />
          </label>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <Trophy className="size-4 text-primary" />
            Preferências do Ranking
          </h2>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-card-foreground">Participar do Ranking</p>
              <p className="text-xs text-muted-foreground">
                {ranking ? "Seus resultados aparecerão no ranking público" : "Seus resultados serão mantidos privados"}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={ranking}
              aria-label="Participar do ranking"
              onClick={() => setRanking((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                ranking ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-card transition-all ${
                  ranking ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <CalendarDays className="size-4 text-primary" />
            Informações da Conta
          </h2>
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Data de Criação</dt>
              <dd className="mt-0.5 text-card-foreground">{currentUser.createdAt}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Plano Atual</dt>
              <dd className="mt-0.5 text-card-foreground">{currentUser.plan}</dd>
            </div>
          </dl>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <CreditCard className="size-4 text-primary" />
            Plano e Assinatura
          </h2>
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-4">
            <p className="text-sm font-medium text-destructive">Plano Inativo</p>
          </div>
          <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <ExternalLink className="size-4" />
            Renovar Plano
          </button>
        </section>
      </div>
    </div>
  );
}
