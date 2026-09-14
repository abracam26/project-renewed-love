import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Wand2 } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GeradorIA } from "@/components/GeradorIA";
import { MaterialReferencia } from "@/components/MaterialReferencia";
import { RegrasGeracao } from "@/components/RegrasGeracao";
import { RevisaoQuestoes } from "@/components/RevisaoQuestoes";

export const Route = createFileRoute("/admin_/gerar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gerar questões com IA — Simulador ABT" },
      {
        name: "description",
        content: "Gere questões a partir do material de apoio, revise e aprove antes de publicar.",
      },
      { property: "og:title", content: "Gerar questões com IA — Simulador ABT" },
      { property: "og:description", content: "Geração assistida e fila de revisão de questões." },
    ],
  }),
  component: AdminGerar,
});

function AdminGerar() {
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
            <GeradorIA token={token} />
            <RevisaoQuestoes token={token} />
            <RegrasGeracao token={token} />
            <MaterialReferencia token={token} />
          </div>
        )}
      </AdminGate>
    </div>
  );
}
