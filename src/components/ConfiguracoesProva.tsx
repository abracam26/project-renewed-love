import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  listarConfiguracoesProva,
  salvarConfiguracaoProva,
} from "@/lib/configuracoes-prova.functions";
import { TEMAS } from "@/lib/questoes-schema";

const TIPOS = ["ABT1", "ABT2", "GRATIS", "LIVRE"] as const;
type Tipo = (typeof TIPOS)[number];

const LABEL: Record<Tipo, string> = {
  ABT1: "Simulado ABT1",
  ABT2: "Simulado ABT2",
  GRATIS: "Teste grátis",
  LIVRE: "Treino livre",
};

type Form = {
  tipo: Tipo;
  total_questoes: number;
  tempo_maximo_min: number;
  nota_corte: number;
  pct_facil: number;
  pct_media: number;
  pct_dificil: number;
  pct_tema_1: number;
  pct_tema_2: number;
  pct_tema_3: number;
  pct_tema_4: number;
  mostrar_explicacao: boolean;
};

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

function numero(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function ConfiguracoesProva({ token }: { token: string }) {
  const listar = useServerFn(listarConfiguracoesProva);
  const salvar = useServerFn(salvarConfiguracaoProva);
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<Record<Tipo, Form> | null>(null);

  const query = useQuery({
    queryKey: ["admin", "configuracoes-prova"],
    queryFn: () => listar({ data: { token } }),
  });

  useEffect(() => {
    if (!query.data) return;
    const m: Partial<Record<Tipo, Form>> = {};
    for (const c of query.data.configs) {
      m[c.tipo as Tipo] = {
        tipo: c.tipo as Tipo,
        total_questoes: c.total_questoes,
        tempo_maximo_min: c.tempo_maximo_min,
        nota_corte: c.nota_corte,
        pct_facil: c.pct_facil,
        pct_media: c.pct_media,
        pct_dificil: c.pct_dificil,
        pct_tema_1: c.pct_tema_1,
        pct_tema_2: c.pct_tema_2,
        pct_tema_3: c.pct_tema_3,
        pct_tema_4: c.pct_tema_4,
        mostrar_explicacao: c.mostrar_explicacao,
      };
    }
    setForms(m as Record<Tipo, Form>);
  }, [query.data]);

  const mut = useMutation({
    mutationFn: (f: Form) => salvar({ data: { token, ...f } }),
    onSuccess: (_r, f) => {
      toast.success(`${LABEL[f.tipo]} atualizado.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "configuracoes-prova"] });
      void queryClient.invalidateQueries({ queryKey: ["configs-prova"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  function set<K extends keyof Form>(tipo: Tipo, campo: K, valor: Form[K]) {
    setForms((prev) => (prev ? { ...prev, [tipo]: { ...prev[tipo], [campo]: valor } } : prev));
  }

  if (query.isPending || !forms) {
    return (
      <section className="panel p-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
        </p>
      </section>
    );
  }

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
        <Settings2 className="size-5 text-primary" />
        Configurações dos simulados
      </h2>
      <p className="text-xs text-muted-foreground">
        Ajuste, para cada tipo, o total de questões, o tempo máximo, a nota de corte, a mistura de
        dificuldade e por tema, e se a explicação aparece para o aluno após o simulado. Os
        percentuais precisam somar 100.
      </p>

      <div className="mt-5 space-y-5">
        {TIPOS.map((tipo) => {
          const f = forms[tipo];
          const somaDif = f.pct_facil + f.pct_media + f.pct_dificil;
          const somaTema = f.pct_tema_1 + f.pct_tema_2 + f.pct_tema_3 + f.pct_tema_4;
          const podeSalvar = somaDif === 100 && somaTema === 100 && !mut.isPending;
          return (
            <form
              key={tipo}
              onSubmit={(e) => {
                e.preventDefault();
                mut.mutate(f);
              }}
              className="rounded-lg border border-border bg-secondary/30 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-card-foreground">{LABEL[tipo]}</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={f.mostrar_explicacao}
                    onChange={(e) => set(tipo, "mostrar_explicacao", e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Mostrar explicação ao aluno
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-muted-foreground">
                  Total de questões
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={f.total_questoes}
                    onChange={(e) => set(tipo, "total_questoes", numero(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Tempo máximo (min)
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={f.tempo_maximo_min}
                    onChange={(e) => set(tipo, "tempo_maximo_min", numero(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Nota mínima (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={f.nota_corte}
                    onChange={(e) => set(tipo, "nota_corte", numero(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>

              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Dificuldade (soma {somaDif}%)
                </p>
                <div className="mt-1 grid gap-3 sm:grid-cols-3">
                  {(["pct_facil", "pct_media", "pct_dificil"] as const).map((k) => (
                    <label key={k} className="text-xs text-muted-foreground">
                      {k === "pct_facil" ? "Fácil" : k === "pct_media" ? "Média" : "Difícil"} (%)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={f[k]}
                        onChange={(e) => set(tipo, k, numero(e.target.value))}
                        className={`mt-1 ${inputClass}`}
                      />
                    </label>
                  ))}
                </div>
                {somaDif !== 100 && (
                  <p className="mt-1 text-[11px] text-destructive">A soma precisa ser 100%.</p>
                )}
              </div>

              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Distribuição por tema (soma {somaTema}%)
                </p>
                <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {([1, 2, 3, 4] as const).map((t) => {
                    const k = `pct_tema_${t}` as const;
                    return (
                      <label key={t} className="text-xs text-muted-foreground">
                        Tema {t} · {TEMAS[t]} (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={f[k]}
                          onChange={(e) => set(tipo, k, numero(e.target.value))}
                          className={`mt-1 ${inputClass}`}
                        />
                      </label>
                    );
                  })}
                </div>
                {somaTema !== 100 && (
                  <p className="mt-1 text-[11px] text-destructive">A soma precisa ser 100%.</p>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={!podeSalvar}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
                >
                  {mut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Salvar {LABEL[tipo]}
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </section>
  );
}
