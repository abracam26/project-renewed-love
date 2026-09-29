import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CreditCard } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { ConfigPagamento } from "@/components/ConfigPagamento";
import { GestorPedidos } from "@/components/GestorPedidos";
import { GestorPlanos } from "@/components/GestorPlanos";

export const Route = createFileRoute("/admin_/pagamentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Planos e pagamentos — Simulador ABT" },
      {
        name: "description",
        content:
          "Planos à venda, forma de pagamento e pedidos dos alunos, com confirmação de pagamento e liberação do acesso.",
      },
    ],
  }),
  component: AdminPagamentos,
});

function AdminPagamentos() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CreditCard className="size-6 text-primary" />
          Planos e pagamentos
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
            <GestorPedidos token={token} />
            <GestorPlanos token={token} />
            <ConfigPagamento token={token} />
          </div>
        )}
      </AdminGate>
    </div>
  );
}
