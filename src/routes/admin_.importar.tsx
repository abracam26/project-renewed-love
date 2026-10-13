import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileUp } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { ImportadorQuestoes } from "@/components/ImportadorQuestoes";

export const Route = createFileRoute("/admin_/importar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Importar questões — Simulador ABT" },
      {
        name: "description",
        content: "Importação técnica de lotes de questões em JSON ou CSV.",
      },
      { property: "og:title", content: "Importar questões — Simulador ABT" },
      { property: "og:description", content: "Importação técnica de questões." },
    ],
  }),
  component: AdminImportar,
});

function AdminImportar() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileUp className="size-6 text-primary" />
          Importar questões
        </h1>
        <Link
          to="/admin/questoes"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao banco de questões
        </Link>
      </div>

      <AdminGate>
        {({ token }) => (
          <div className="space-y-5">
            <p className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
              Uso técnico: importação em lote feita pelo desenvolvedor. Para editar, ativar ou
              desativar questões, use o banco de questões.
            </p>
            <ImportadorQuestoes token={token} />
          </div>
        )}
      </AdminGate>
    </div>
  );
}
