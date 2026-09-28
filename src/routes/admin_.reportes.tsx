import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Flag } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GestorReportes } from "@/components/GestorReportes";

export const Route = createFileRoute("/admin_/reportes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reportes de questões — Simulador ABT" },
      {
        name: "description",
        content: "Problemas apontados pelos alunos nas questões, para correção pela equipe.",
      },
    ],
  }),
  component: AdminReportes,
});

function AdminReportes() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Flag className="size-6 text-primary" />
          Reportes de questões
        </h1>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Admin
        </Link>
      </div>

      <AdminGate>{({ token }) => <GestorReportes token={token} />}</AdminGate>
    </div>
  );
}
