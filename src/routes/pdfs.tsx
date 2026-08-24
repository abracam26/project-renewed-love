import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { pdfs } from "@/lib/mock-data";

export const Route = createFileRoute("/pdfs")({
  head: () => ({
    meta: [
      { title: "Materiais em PDF — Simulador ABT" },
      { name: "description", content: "Apostilas, resumos e cadernos de questões em PDF para a certificação ABT." },
      { property: "og:title", content: "Materiais em PDF — Simulador ABT" },
      { property: "og:description", content: "Baixe apostilas e resumos de estudo." },
    ],
  }),
  component: Pdfs,
});

function Pdfs() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">PDFs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Materiais de apoio para complementar seus simulados.</p>
      </div>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pdfs.map((p) => (
          <li key={p.nome} className="panel flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/15">
                <FileText className="size-5 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-card-foreground">{p.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.categoria} · {p.paginas} páginas · {p.tamanho}
                </p>
              </div>
            </div>
            <button className="mt-5 inline-flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-xs font-medium text-card-foreground transition-colors hover:bg-accent">
              <Download className="size-3.5 text-primary" />
              Baixar PDF
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
