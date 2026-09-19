import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCheck, ClipboardList, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { aprovarQuestoes, listarPendentes } from "@/lib/ia-geracao.functions";
import { excluirQuestoes } from "@/lib/questoes.functions";
import { TEMAS, type QuestaoRow } from "@/lib/questoes-schema";
import { EditorQuestao } from "@/components/EditorQuestao";

/**
 * Fila de revisão das questões geradas por IA. A modal de edição é o
 * componente compartilhado `EditorQuestao`, que também aparece no banco de
 * questões (`GestorQuestoes`). Aqui a modal recebe `permitirAprovar=true`
 * para exibir o botão "Salvar e aprovar".
 */
export function RevisaoQuestoes({ token }: { token: string }) {
  const [tema, setTema] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<QuestaoRow | null>(null);

  const listar = useServerFn(listarPendentes);
  const aprovar = useServerFn(aprovarQuestoes);
  const excluir = useServerFn(excluirQuestoes);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "pendentes", tema],
    queryFn: () => listar({ data: { token, tema } }),
  });
  const pendentes = query.data?.questoes ?? [];

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const mutAprovar = useMutation({
    mutationFn: (ids: string[]) => aprovar({ data: { token, ids } }),
    onSuccess: (r) => {
      toast.success(`${r.aprovadas} questão(ões) aprovada(s) e ativa(s) nos simulados.`);
      setSelecionadas(new Set());
      void invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao aprovar."),
  });

  const mutDescartar = useMutation({
    mutationFn: (ids: string[]) => excluir({ data: { token, ids } }),
    onSuccess: (r) => {
      toast.success(`${r.excluidas} questão(ões) descartada(s).`);
      setSelecionadas(new Set());
      void invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao descartar."),
  });

  function alternar(id: string) {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const ocupado = mutAprovar.isPending || mutDescartar.isPending;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <ClipboardList className="size-5 text-primary" />
            Fila de revisão
          </h2>
          <p className="text-xs text-muted-foreground">
            {pendentes.length} questão(ões) aguardando aprovação. Aprove, edite ou descarte. Nada
            entra em simulado sem aprovação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tema ?? ""}
            onChange={(e) => setTema(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">Todos os temas</option>
            {([1, 2, 3, 4] as const).map((t) => (
              <option key={t} value={t}>
                Tema {t} · {TEMAS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selecionadas.size === 0 || ocupado}
            onClick={() => mutAprovar.mutate([...selecionadas])}
            className="inline-flex items-center gap-2 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground disabled:opacity-50"
          >
            <CheckCheck className="size-3.5" /> Aprovar selecionadas ({selecionadas.size})
          </button>
          <button
            type="button"
            disabled={selecionadas.size === 0 || ocupado}
            onClick={() => {
              if (
                confirm(
                  `Descartar ${selecionadas.size} questão(ões)? Esta ação não pode ser desfeita.`,
                )
              )
                mutDescartar.mutate([...selecionadas]);
            }}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Descartar selecionadas
          </button>
        </div>
      </div>

      {query.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
        </p>
      ) : pendentes.length === 0 ? (
        <p className="mt-3 rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma questão pendente. Gere um lote acima ou importe questões como rascunho.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {pendentes.map((q) => {
            const sel = selecionadas.has(q.id);
            return (
              <li
                key={q.id}
                className={`rounded-lg border p-4 transition-colors ${
                  sel ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => alternar(q.id)}
                    aria-label={`Selecionar ${q.id}`}
                    className="mt-1 size-4 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono text-card-foreground">{q.id}</span> · Tema {q.tema}{" "}
                      · {q.nivel} · {q.dificuldade}
                      {q.subtema ? ` · ${q.subtema}` : ""} · origem {q.origem}
                    </p>
                    <p className="mt-1 text-sm text-card-foreground">{q.enunciado}</p>
                    <ul className="mt-2 space-y-1">
                      {q.alternativas.map((a) => (
                        <li
                          key={a.letra}
                          className={`rounded-md px-2 py-1 text-xs ${
                            a.letra === q.gabarito
                              ? "bg-success/15 text-card-foreground"
                              : "text-card-foreground/80"
                          }`}
                        >
                          <span className="mr-1 font-semibold uppercase">({a.letra})</span>
                          {a.texto}
                        </li>
                      ))}
                    </ul>
                    {q.explicacao && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-card-foreground">Explicação: </span>
                        {q.explicacao}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[
                        q.fonte_norma,
                        q.fonte_artigo,
                        q.fonte_pagina ? `p. ${q.fonte_pagina} do material` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem fonte informada"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => mutAprovar.mutate([q.id])}
                      disabled={ocupado}
                      title="Aprovar"
                      className="rounded-md p-2 text-success hover:bg-success/10 disabled:opacity-50"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(q)}
                      title="Editar"
                      className="rounded-md p-2 text-primary hover:bg-accent"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Descartar ${q.id}?`)) mutDescartar.mutate([q.id]);
                      }}
                      disabled={ocupado}
                      title="Descartar"
                      className="rounded-md p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditorQuestao
        token={token}
        questao={editando}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        onSalvo={() => void invalidar()}
        permitirAprovar
      />
    </section>
  );
}
