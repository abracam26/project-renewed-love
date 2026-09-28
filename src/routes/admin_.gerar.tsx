import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Wand2 } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GeradorIA } from "@/components/GeradorIA";
import { MaterialReferencia } from "@/components/MaterialReferencia";
import { RegrasGeracao } from "@/components/RegrasGeracao";
import { RevisaoQuestoes } from "@/components/RevisaoQuestoes";
import { EXAMES, EXAME_LABEL, MATERIAL_DO_EXAME, type Exame } from "@/lib/questoes-schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin_/gerar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gerar questões com IA — Simulador ABT" },
      {
        name: "description",
        content:
          "Gere questões a partir do material de cada prova (ABT1/ABT2 ou ABT – Correspondentes), revise e aprove antes de publicar.",
      },
      { property: "og:title", content: "Gerar questões com IA — Simulador ABT" },
      { property: "og:description", content: "Geração assistida e fila de revisão de questões." },
    ],
  }),
  component: AdminGerar,
});

function AdminGerar() {
  const [exame, setExame] = useState<Exame>("ABT12");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Wand2 className="size-6 text-primary" />
          Gerar questões com IA
        </h1>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Admin
        </Link>
      </div>

      <AdminGate>
        {({ token }) => (
          <div className="space-y-5">
            <section className="panel flex flex-wrap items-center gap-3 p-4">
              <span className="text-sm font-semibold text-card-foreground">Prova</span>
              <div
                role="tablist"
                aria-label="Prova"
                className="inline-flex flex-wrap rounded-lg border border-border bg-secondary/40 p-1"
              >
                {EXAMES.map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="tab"
                    aria-selected={exame === x}
                    onClick={() => setExame(x)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      exame === x
                        ? "bg-primary text-primary-foreground shadow-gold"
                        : "text-muted-foreground hover:text-card-foreground",
                    )}
                  >
                    {EXAME_LABEL[x]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Material: {MATERIAL_DO_EXAME[exame]}. Geração, fila de revisão, regras e material
                abaixo são desta prova.
              </p>
            </section>
            {/* key: ao trocar de prova, cada bloco recomeça com o estado limpo */}
            <GeradorIA key={`gerador-${exame}`} token={token} exame={exame} />
            <RevisaoQuestoes key={`revisao-${exame}`} token={token} exame={exame} />
            <RegrasGeracao key={`regras-${exame}`} token={token} exame={exame} />
            <MaterialReferencia key={`material-${exame}`} token={token} exame={exame} />
          </div>
        )}
      </AdminGate>
    </div>
  );
}
