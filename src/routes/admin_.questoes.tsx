import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Database } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GestorQuestoes } from "@/components/GestorQuestoes";

export const Route = createFileRoute("/admin_/questoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Banco de questões — Simulador ABT" },
      {
        name: "description",
        content: "Gerencie o banco de questões do simulador.",
      },
      { property: "og:title", content: "Banco de questões — Simulador ABT" },
      { property: "og:description", content: "Gestão do banco de questões." },
    ],
  }),
  component: AdminQuestoes,
});

function AdminQuestoes() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Database className="size-6 text-primary" />
          Banco de questões
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
            <GestorQuestoes token={token} />
            <p className="text-right text-[11px] text-muted-foreground/70">
              <Link to="/admin/importar" className="hover:text-muted-foreground hover:underline">
                Importação em lote (uso técnico)
              </Link>
            </p>
          </div>
        )}
      </AdminGate>
    </div>
  );
}
