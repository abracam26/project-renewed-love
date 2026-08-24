import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkle } from "lucide-react";
import { planos } from "@/lib/mock-data";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos e Assinaturas — Simulador ABT" },
      { name: "description", content: "Compare o teste gratuito e os planos mensal e anual do Simulador ABT." },
      { property: "og:title", content: "Planos e Assinaturas — Simulador ABT" },
      { property: "og:description", content: "Escolha o plano ideal para sua preparação." },
    ],
  }),
  component: Planos,
});

function Planos() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Planos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu plano atual está <span className="font-semibold text-destructive">Inativo</span>. Escolha um plano para
          liberar os simulados completos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {planos.map((p) => (
          <div
            key={p.nome}
            className={`panel flex flex-col p-6 ${p.destaque ? "border-primary shadow-gold" : ""}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-card-foreground">{p.nome}</h2>
              {p.destaque && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  <Sparkle className="size-3" />
                  Popular
                </span>
              )}
            </div>
            <p className="mt-4 text-3xl font-bold text-card-foreground">{p.preco}</p>
            <p className="text-xs text-muted-foreground">{p.periodo}</p>

            <ul className="mt-6 flex-1 space-y-2.5">
              {p.beneficios.map((b) => (
                <li key={b} className="flex gap-2 text-sm text-card-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {b}
                </li>
              ))}
            </ul>

            <button
              className={`mt-6 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                p.destaque
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border bg-secondary text-card-foreground hover:bg-accent"
              }`}
            >
              {p.preco === "R$ 0" ? "Plano atual" : "Assinar agora"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
