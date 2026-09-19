import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { editarQuestao } from "@/lib/ia-geracao.functions";
import {
  DIFICULDADES,
  LETRAS,
  NIVEIS,
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

/**
 * Formulário de edição de questão reutilizado pela fila de revisão
 * (`RevisaoQuestoes`) e pelo banco de questões (`GestorQuestoes`).
 * Chama a mesma função de servidor `editarQuestao`, que já valida com o
 * esquema padrão do banco e opcionalmente aprova a questão.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

export type EdicaoQuestao = {
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

export function paraEdicao(q: QuestaoRow): EdicaoQuestao {
  const alts: Record<Letra, string> = { a: "", b: "", c: "", d: "" };
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

type Props = {
  token: string;
  questao: QuestaoRow | null;
  aberto: boolean;
  onFechar: () => void;
  onSalvo?: () => void;
  /** Quando true, mostra o botão "Salvar e aprovar" (fila de revisão). */
  permitirAprovar?: boolean;
};

export function EditorQuestao({
  token,
  questao,
  aberto,
  onFechar,
  onSalvo,
  permitirAprovar = false,
}: Props) {
  const editar = useServerFn(editarQuestao);
  const [edicao, setEdicao] = useState<EdicaoQuestao | null>(null);

  // Sincroniza estado interno quando a questão muda
  const questaoId = questao?.id ?? null;
  if (edicao?.id !== questaoId) {
    setEdicao(questao ? paraEdicao(questao) : null);
  }

  const mut = useMutation({
    mutationFn: (args: { e: EdicaoQuestao; aprovar: boolean }) =>
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
      onSalvo?.();
      onFechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {edicao && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate({ e: edicao, aprovar: false });
            }}
            className="space-y-3"
          >
            <DialogHeader>
              <DialogTitle className="font-mono">{edicao.id}</DialogTitle>
              <DialogDescription>
                {permitirAprovar
                  ? "Edite a questão e salve, ou salve já aprovando."
                  : "Edite qualquer campo. As alterações valem imediatamente para os próximos simulados."}
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
                <span className="mt-2 w-5 font-semibold uppercase text-card-foreground">({l})</span>
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
                onClick={onFechar}
                className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mut.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
              >
                {mut.isPending && <Loader2 className="size-4 animate-spin" />}
                Salvar
              </button>
              {permitirAprovar && (
                <button
                  type="button"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ e: edicao, aprovar: true })}
                  className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground disabled:opacity-50"
                >
                  {mut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Salvar e aprovar
                </button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
