import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GestorUsuarios } from "@/components/GestorUsuarios";

export const Route = createFileRoute("/admin_/usuarios")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Usuários e planos — Simulador ABT" },
      {
        name: "description",
        content: "Consulte os dados de cadastro dos alunos e gerencie planos e prazos de acesso.",
      },
    ],
  }),
  component: AdminUsuarios,
});

function AdminUsuarios() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Users className="size-6 text-primary" />
          Usuários e planos
        </h1>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Admin
        </Link>
      </div>

      <AdminGate>{({ token }) => <GestorUsuarios token={token} />}</AdminGate>
    </div>
  );
}
