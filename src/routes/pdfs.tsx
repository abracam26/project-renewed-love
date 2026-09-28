import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import { linkDownloadMaterial, listarMateriais } from "@/lib/materiais.functions";

export const Route = createFileRoute("/pdfs")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Materiais em PDF — Simulador ABT" },
      {
        name: "description",
        content: "Baixe o Material de Apoio da ABRACAM para as certificações ABT1 e ABT2.",
      },
    ],
  }),
  component: Pdfs,
});

function fmtTamanho(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Pdfs() {
  const { token, loading } = useToken();
  const listar = useServerFn(listarMateriais);
  const baixar = useServerFn(linkDownloadMaterial);
  const [baixando, setBaixando] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["materiais", token],
    queryFn: () => listar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  const mut = useMutation({
    mutationFn: (id: string) => baixar({ data: { token: token as string, id } }),
    onMutate: (id) => setBaixando(id),
    onSuccess: ({ url }) => {
      // O link é temporário e já força o download com o nome do arquivo
      window.location.assign(url);
    },
    onError: (e) => toast.error(mensagemErro(e)),
    onSettled: () => setBaixando(null),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Materiais em PDF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Material oficial da ABRACAM para estudar para as certificações ABT1 e ABT2. As questões do
          simulador são elaboradas a partir dele.
        </p>
      </div>

      {loading || query.isPending ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Carregando materiais...
        </div>
      ) : query.isError ? (
        <div className="panel p-6 text-center text-sm text-destructive">
          {mensagemErro(query.error)}
        </div>
      ) : (query.data?.materiais.length ?? 0) === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Nenhum material disponível no momento.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data?.materiais.map((m) => (
            <li key={m.id} className="panel flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/15">
                  <FileText className="size-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-card-foreground">{m.titulo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.categoria} · PDF · {fmtTamanho(m.tamanho_bytes)}
                  </p>
                </div>
              </div>
              {m.descricao && (
                <p className="mt-3 flex-1 text-xs leading-relaxed text-card-foreground/90">
                  {m.descricao}
                </p>
              )}
              <button
                type="button"
                disabled={mut.isPending}
                onClick={() => mut.mutate(m.id)}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {baixando === m.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Baixar PDF
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
