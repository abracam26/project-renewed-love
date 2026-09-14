import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpenCheck, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  obterRegrasGeracao,
  restaurarRegrasGeracao,
  salvarRegrasGeracao,
} from "@/lib/ia-geracao.functions";

export function RegrasGeracao({ token }: { token: string }) {
  const obter = useServerFn(obterRegrasGeracao);
  const salvar = useServerFn(salvarRegrasGeracao);
  const restaurar = useServerFn(restaurarRegrasGeracao);
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "regras"],
    queryFn: () => obter({ data: { token } }),
  });

  useEffect(() => {
    if (query.data) setTexto(query.data.regras);
  }, [query.data]);

  const mutSalvar = useMutation({
    mutationFn: () => salvar({ data: { token, regras: texto } }),
    onSuccess: () => {
      toast.success("Regras de geração salvas.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "regras"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const mutRestaurar = useMutation({
    mutationFn: () => restaurar({ data: { token } }),
    onSuccess: (r) => {
      setTexto(r.regras);
      toast.success("Regras padrão restauradas.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "regras"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao restaurar."),
  });

  const alterado = query.data ? texto !== query.data.regras : false;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <BookOpenCheck className="size-5 text-primary" />
            Regras de geração
          </h2>
          <p className="text-xs text-muted-foreground">
            Instruções que a IA segue em toda geração: fonte, formato da banca, construção de
            distratores, níveis.{" "}
            {query.data?.personalizada
              ? `Versão personalizada, salva em ${new Date(query.data.atualizadaEm ?? "").toLocaleString("pt-BR")}.`
              : "Usando o texto padrão."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          {aberto ? "Ocultar" : "Ver e editar"}
        </button>
      </div>

      {aberto && (
        <div className="mt-4 space-y-3">
          {query.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
            </p>
          ) : (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={22}
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!alterado || mutSalvar.isPending}
              onClick={() => mutSalvar.mutate()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
            >
              <Save className="size-4" /> Salvar regras
            </button>
            <button
              type="button"
              disabled={mutRestaurar.isPending}
              onClick={() => {
                if (confirm("Restaurar o texto padrão e descartar as edições?"))
                  mutRestaurar.mutate();
              }}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
            >
              <RotateCcw className="size-4" /> Restaurar padrão
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
