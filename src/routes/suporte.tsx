import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Loader2, MessageSquareReply, Send } from "lucide-react";
import { toast } from "sonner";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import {
  CATEGORIA_CHAMADO_LABEL,
  CATEGORIAS_CHAMADO,
  STATUS_CHAMADO_LABEL,
  type CategoriaChamado,
  type StatusChamado,
} from "@/lib/suporte";
import { abrirChamado, meusChamados } from "@/lib/suporte.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/suporte")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Suporte — Simulador ABT" },
      {
        name: "description",
        content: "Abra um chamado e acompanhe as respostas da equipe da ABRACAM.",
      },
    ],
  }),
  component: Suporte,
});

const COR_STATUS: Record<StatusChamado, string> = {
  aberto: "bg-info/15 text-info",
  respondido: "bg-success/15 text-success",
  fechado: "bg-muted text-muted-foreground",
};

const campoClass =
  "mt-2 w-full rounded-md border border-input bg-secondary px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none";

function dataHora(v: string | null) {
  if (!v) return "";
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Suporte() {
  const { token, loading } = useToken();
  const abrir = useServerFn(abrirChamado);
  const listar = useServerFn(meusChamados);
  const queryClient = useQueryClient();

  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<CategoriaChamado | "">("");
  const [mensagem, setMensagem] = useState("");

  const query = useQuery({
    queryKey: ["meus-chamados", token],
    queryFn: () => listar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  const mut = useMutation({
    mutationFn: () =>
      abrir({
        data: {
          token: token as string,
          categoria: categoria as CategoriaChamado,
          titulo,
          mensagem,
        },
      }),
    onSuccess: async () => {
      toast.success("Chamado enviado! A resposta aparece aqui nesta página.");
      setTitulo("");
      setCategoria("");
      setMensagem("");
      await queryClient.invalidateQueries({ queryKey: ["meus-chamados"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const chamados = query.data?.chamados ?? [];

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <HelpCircle className="size-6 text-primary" />
        Suporte
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-card-foreground">Abrir novo chamado</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Para reportar uma questão específica, use o botão "Reportar questão" que aparece na
            própria questão, durante o simulado ou no resultado.
          </p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!categoria) {
                toast.error("Escolha uma categoria.");
                return;
              }
              mut.mutate();
            }}
          >
            <label className="block">
              <span className="text-xs font-medium text-card-foreground">Assunto</span>
              <input
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={150}
                placeholder="Resuma o assunto em poucas palavras"
                className={campoClass}
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-card-foreground">Categoria</span>
              <select
                required
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaChamado)}
                className={campoClass}
              >
                <option value="">Selecione uma categoria</option>
                {CATEGORIAS_CHAMADO.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_CHAMADO_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-card-foreground">Mensagem</span>
              <textarea
                required
                rows={6}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                maxLength={5000}
                placeholder="Conte o que aconteceu ou qual é a sua dúvida..."
                className={cn(campoClass, "resize-y")}
              />
            </label>

            <button
              type="submit"
              disabled={mut.isPending || !token}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {mut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar chamado
            </button>
          </form>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-card-foreground">Meus chamados</h2>
          {loading || query.isPending ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
            </p>
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-destructive">
              {mensagemErro(query.error)}
            </p>
          ) : chamados.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Você ainda não abriu nenhum chamado.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {chamados.map((c) => (
                <li key={c.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-card-foreground">{c.titulo}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {CATEGORIA_CHAMADO_LABEL[c.categoria]} · {dataHora(c.created_at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-semibold",
                        COR_STATUS[c.status],
                      )}
                    >
                      {STATUS_CHAMADO_LABEL[c.status]}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-xs text-card-foreground/90">
                    {c.mensagem}
                  </p>
                  {c.resposta && (
                    <div className="mt-3 rounded-md border border-success/30 bg-success/10 p-3 text-xs text-card-foreground">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <MessageSquareReply className="size-3.5 text-success" />
                        Resposta da ABRACAM
                        <span className="font-normal text-muted-foreground">
                          · {dataHora(c.respondido_em)}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-line">{c.resposta}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
