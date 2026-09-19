import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Settings2 } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { ConfiguracoesProva } from "@/components/ConfiguracoesProva";

export const Route = createFileRoute("/admin_/configuracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configurações dos simulados — Simulador ABT" },
      {
        name: "description",
        content:
          "Ajuste os parâmetros dos simulados: total de questões, tempo, nota de corte, mistura de dificuldade e por tema.",
      },
    ],
  }),
  component: AdminConfiguracoes,
});

function AdminConfiguracoes() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Settings2 className="size-6 text-primary" />
          Configurações dos simulados
        </h1>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Admin
        </Link>
      </div>

      <AdminGate>{({ token }) => <ConfiguracoesProva token={token} />}</AdminGate>
    </div>
  );
}
