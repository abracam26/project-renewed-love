import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { GestorSuporte } from "@/components/GestorSuporte";

export const Route = createFileRoute("/admin_/suporte")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chamados de suporte — Simulador ABT" },
      { name: "description", content: "Chamados abertos pelos alunos e respostas da equipe." },
    ],
  }),
  component: AdminSuporte,
});

function AdminSuporte() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MessageSquare className="size-6 text-primary" />
          Chamados de suporte
        </h1>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Admin
        </Link>
      </div>

      <AdminGate>{({ token }) => <GestorSuporte token={token} />}</AdminGate>
    </div>
  );
}
