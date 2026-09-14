import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCheck, ClipboardList, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { aprovarQuestoes, editarQuestao, listarPendentes } from "@/lib/ia-geracao.functions";
import { excluirQuestoes } from "@/lib/questoes.functions";
import {
  DIFICULDADES,
  LETRAS,
  NIVEIS,
  TEMAS,
  type Dificuldade,
  type Letra,
  type Nivel,
  type QuestaoRow,
} from "@/lib/questoes-schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

type Edicao = {
  id: string;
  subtema: string;
  nivel: Nivel;
  dificuldade: Dificuldade;
  enunciado: string;
  alternativas: Record<Letra, string>;
  gabarito: Letra;
  explicacao: string;
  fonte_norma: string;
  fonte_artigo: string;
  fonte_pagina: string;
};

function paraEdicao(q: QuestaoRow): Edicao {
  const alts = { a: "", b: "", c: "", d: "" } as Record<Letra, string>;
  for (const a of q.alternativas) alts[a.letra] = a.texto;
  return {
    id: q.id,
    subtema: q.subtema ?? "",
    nivel: q.nivel,
    dificuldade: q.dificuldade,
    enunciado: q.enunciado,
    alternativas: alts,
    gabarito: q.gabarito,
    explicacao: q.explicacao ?? "",
    fonte_norma: q.fonte_norma ?? "",
    fonte_artigo: q.fonte_artigo ?? "",
    fonte_pagina: q.fonte_pagina ? String(q.fonte_pagina) : "",
  };
}

export function RevisaoQuestoes({ token }: { token: string }) {
  const [tema, setTema] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  const listar = useServerFn(listarPendentes);
  const aprovar = useServerFn(aprovarQuestoes);
  const editar = useServerFn(editarQuestao);
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

  const mutEditar = useMutation({
    mutationFn: (args: { e: Edicao; aprovar: boolean }) =>
      editar({
        data: {
          token,
          id: args.e.id,
          subtema: args.e.subtema.trim() || null,
          nivel: args.e.nivel,
          dificuldade: args.e.dificuldade,
          enunciado: args.e.enunciado,
          alternativas: LETRAS.map((l) => ({ letra: l, texto: args.e.alternativas[l] })),
          gabarito: args.e.gabarito,
          explicacao: args.e.explicacao.trim() || null,
          fonte_norma: args.e.fonte_norma.trim() || null,
          fonte_artigo: args.e.fonte_artigo.trim() || null,
          fonte_pagina: args.e.fonte_pagina ? Number(args.e.fonte_pagina) : null,
          aprovar: args.aprovar,
        },
      }),
    onSuccess: (_r, args) => {
      toast.success(args.aprovar ? `${args.e.id} salva e aprovada.` : `${args.e.id} salva.`);
      setEdicao(null);
      void invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
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
                      onClick={() => setEdicao(paraEdicao(q))}
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

      <Dialog open={edicao !== null} onOpenChange={(o) => !o && setEdicao(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {edicao && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutEditar.mutate({ e: edicao, aprovar: false });
              }}
              className="space-y-3"
            >
              <DialogHeader>
                <DialogTitle className="font-mono">{edicao.id}</DialogTitle>
                <DialogDescription>
                  Edite a questão e salve, ou salve já aprovando.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-muted-foreground">
                  Nível
                  <select
                    value={edicao.nivel}
                    onChange={(e) => setEdicao({ ...edicao, nivel: e.target.value as Nivel })}
                    className={`mt-1 ${inputClass}`}
                  >
                    {NIVEIS.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Dificuldade
                  <select
                    value={edicao.dificuldade}
                    onChange={(e) =>
                      setEdicao({ ...edicao, dificuldade: e.target.value as Dificuldade })
                    }
                    className={`mt-1 ${inputClass}`}
                  >
                    {DIFICULDADES.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Subtema
                  <input
                    value={edicao.subtema}
                    onChange={(e) => setEdicao({ ...edicao, subtema: e.target.value })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>

              <label className="block text-xs text-muted-foreground">
                Enunciado
                <textarea
                  value={edicao.enunciado}
                  onChange={(e) => setEdicao({ ...edicao, enunciado: e.target.value })}
                  rows={3}
                  className={`mt-1 resize-y ${inputClass}`}
                />
              </label>

              {LETRAS.map((l) => (
                <label key={l} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name="gabarito"
                    checked={edicao.gabarito === l}
                    onChange={() => setEdicao({ ...edicao, gabarito: l })}
                    title="Marcar como gabarito"
                    className="mt-2.5 accent-primary"
                  />
                  <span className="mt-2 w-5 font-semibold uppercase text-card-foreground">
                    ({l})
                  </span>
                  <textarea
                    value={edicao.alternativas[l]}
                    onChange={(e) =>
                      setEdicao({
                        ...edicao,
                        alternativas: { ...edicao.alternativas, [l]: e.target.value },
                      })
                    }
                    rows={2}
                    className={`resize-y ${inputClass}`}
                  />
                </label>
              ))}

              <label className="block text-xs text-muted-foreground">
                Explicação
                <textarea
                  value={edicao.explicacao}
                  onChange={(e) => setEdicao({ ...edicao, explicacao: e.target.value })}
                  rows={3}
                  className={`mt-1 resize-y ${inputClass}`}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-muted-foreground">
                  Norma
                  <input
                    value={edicao.fonte_norma}
                    onChange={(e) => setEdicao({ ...edicao, fonte_norma: e.target.value })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Artigo
                  <input
                    value={edicao.fonte_artigo}
                    onChange={(e) => setEdicao({ ...edicao, fonte_artigo: e.target.value })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Página do material
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={edicao.fonte_pagina}
                    onChange={(e) => setEdicao({ ...edicao, fonte_pagina: e.target.value })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEdicao(null)}
                  className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mutEditar.isPending}
                  className="rounded-md border border-primary/60 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  disabled={mutEditar.isPending}
                  onClick={() => mutEditar.mutate({ e: edicao, aprovar: true })}
                  className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground disabled:opacity-50"
                >
                  {mutEditar.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Salvar e aprovar
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
