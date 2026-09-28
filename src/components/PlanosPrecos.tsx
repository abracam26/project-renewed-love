import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/erros";
import { obterPlanosInfo, salvarPlanosInfo, type PlanosInfo } from "@/lib/planos-info.functions";

/** Preço e descrição dos planos mostrados na página Planos (/admin/configuracoes). */

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

export function PlanosPrecos({ token }: { token: string }) {
  const obter = useServerFn(obterPlanosInfo);
  const query = useQuery({
    queryKey: ["planos-info", token],
    queryFn: () => obter({ data: { token } }),
  });

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
        <CreditCard className="size-5 text-primary" />
        Planos e preços
      </h2>
      <p className="text-xs text-muted-foreground">
        O que os alunos veem na página Planos. Deixe o preço em branco para mostrar "Consulte a
        ABRACAM".
      </p>
      {query.isPending ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
        </p>
      ) : query.isError || !query.data ? (
        <p className="py-6 text-sm text-destructive">{mensagemErro(query.error)}</p>
      ) : (
        <FormPlanos token={token} inicial={query.data.info} />
      )}
    </section>
  );
}

function FormPlanos({ token, inicial }: { token: string; inicial: PlanosInfo }) {
  const salvar = useServerFn(salvarPlanosInfo);
  const queryClient = useQueryClient();
  const [info, setInfo] = useState<PlanosInfo>(inicial);

  const mut = useMutation({
    mutationFn: () => salvar({ data: { token, ...info } }),
    onSuccess: async () => {
      toast.success("Planos atualizados.");
      await queryClient.invalidateQueries({ queryKey: ["planos-info"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const campo = (plano: "mensal" | "anual", chave: "preco" | "descricao", valor: string) =>
    setInfo((v) => ({ ...v, [plano]: { ...v[plano], [chave]: valor } }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="mt-4 space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {(["mensal", "anual"] as const).map((p) => (
          <fieldset key={p} className="rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-card-foreground">
              Plano {p === "mensal" ? "Mensal" : "Anual"}
            </legend>
            <label className="block text-xs text-muted-foreground">
              Preço (como deve aparecer)
              <input
                value={info[p].preco}
                onChange={(e) => campo(p, "preco", e.target.value)}
                maxLength={60}
                placeholder={p === "mensal" ? "Ex.: R$ 49,90" : "Ex.: R$ 399,00 ou 12x de R$ 35"}
                className={inputClass}
              />
            </label>
            <label className="mt-3 block text-xs text-muted-foreground">
              Descrição curta
              <textarea
                value={info[p].descricao}
                onChange={(e) => campo(p, "descricao", e.target.value)}
                maxLength={300}
                rows={2}
                placeholder={
                  p === "mensal" ? "Acesso completo por 1 mês." : "Acesso completo por 12 meses."
                }
                className={`${inputClass} resize-y`}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          {mut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Salvar planos
        </button>
      </div>
    </form>
  );
}
