import { createFileRoute } from "@tanstack/react-router";
import { HelpCircle, Send } from "lucide-react";
import { tickets } from "@/lib/mock-data";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte — Simulador ABT" },
      { name: "description", content: "Abra um chamado e acompanhe seus tickets de suporte do Simulador ABT." },
      { property: "og:title", content: "Suporte — Simulador ABT" },
      { property: "og:description", content: "Fale com nossa equipe de suporte." },
    ],
  }),
  component: Suporte,
});

function Suporte() {
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <HelpCircle className="size-6 text-primary" />
        Suporte
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-card-foreground">Abrir Novo Chamado</h2>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <label className="block">
              <span className="text-xs font-medium text-card-foreground">Título do Problema</span>
              <input
                placeholder="Descreva brevemente o problema"
                className="mt-2 w-full rounded-md border border-input bg-secondary px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-card-foreground">Categoria</span>
              <select
                defaultValue=""
                className="mt-2 w-full rounded-md border border-input bg-secondary px-3 py-2.5 text-sm text-card-foreground focus:border-ring focus:outline-none"
              >
                <option value="">Selecione uma categoria</option>
                <option>Pagamento e assinatura</option>
                <option>Erro em questão</option>
                <option>Acesso à conta</option>
                <option>Problema técnico</option>
                <option>Outro</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-card-foreground">Descrição Detalhada</span>
              <textarea
                rows={6}
                placeholder="Descreva detalhadamente o problema encontrado..."
                className="mt-2 w-full resize-y rounded-md border border-input bg-secondary px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </label>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Send className="size-4" />
              Enviar Solicitação
            </button>
          </form>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-card-foreground">Meus Chamados</h2>
          {tickets.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nenhum ticket encontrado</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
