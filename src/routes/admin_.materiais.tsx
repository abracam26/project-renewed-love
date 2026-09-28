import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GestorMateriais } from "@/components/GestorMateriais";

export const Route = createFileRoute("/admin_/materiais")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Materiais em PDF — Simulador ABT" },
      { name: "description", content: "Envio dos PDFs disponíveis para os alunos." },
    ],
  }),
  component: AdminMateriais,
});

function AdminMateriais() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileText className="size-6 text-primary" />
          Materiais em PDF
        </h1>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Admin
        </Link>
      </div>

      <AdminGate>{({ token }) => <GestorMateriais token={token} />}</AdminGate>
    </div>
  );
}
