import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Flag, Loader2, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { EditorQuestao } from "@/components/EditorQuestao";
import { mensagemErro } from "@/lib/erros";
import type { QuestaoRow } from "@/lib/questoes-schema";
import {
  MOTIVO_LABEL,
  STATUS_REPORTE,
  STATUS_REPORTE_LABEL,
  type StatusReporte,
} from "@/lib/reportes";
import { atualizarReporte, listarReportes, type ReporteAdmin } from "@/lib/reportes.functions";
import { cn } from "@/lib/utils";

/**
 * Painel /admin/reportes: problemas apontados pelos alunos nas questões.
 * O admin abre a questão no editor, corrige e marca o reporte como resolvido
 * (ou descarta, se não houver erro).
 */

type Filtro = StatusReporte | "todos";

const COR_STATUS: Record<StatusReporte, string> = {
  aberto: "bg-destructive/15 text-destructive",
  resolvido: "bg-success/15 text-success",
  descartado: "bg-muted text-muted-foreground",
};

function dataHora(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function GestorReportes({ token }: { token: string }) {
  const listar = useServerFn(listarReportes);
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  const [editando, setEditando] = useState<QuestaoRow | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "reportes", filtro],
    queryFn: () => listar({ data: { token, status: filtro } }),
  });

  const totais = query.data?.totais;
  const opcoes: Filtro[] = [...STATUS_REPORTE, "todos"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {opcoes.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
              filtro === f
                ? "border-primary bg-primary text-primary-foreground shadow-gold"
                : "border-border bg-card text-card-foreground hover:bg-accent",
            )}
          >
            {f === "todos" ? "Todos" : `${STATUS_REPORTE_LABEL[f]}s`}
            {f !== "todos" && totais ? ` (${totais[f]})` : ""}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <p className="panel flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando reportes...
        </p>
      ) : query.isError ? (
        <p className="panel p-6 text-center text-sm text-destructive">
          {mensagemErro(query.error)}
        </p>
      ) : (query.data?.reportes.length ?? 0) === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {filtro === "aberto" ? "Nenhum reporte aberto. Tudo em dia!" : "Nenhum reporte aqui."}
        </p>
      ) : (
        <ul className="space-y-3">
          {query.data?.reportes.map((r) => (
            <CartaoReporte
              key={r.id}
              token={token}
              reporte={r}
              onEditarQuestao={(q) => setEditando(q)}
            />
          ))}
        </ul>
      )}

      <EditorQuestao
        token={token}
        questao={editando}
        aberto={Boolean(editando)}
        onFechar={() => setEditando(null)}
        onSalvo={() => {
          void queryClient.invalidateQueries({ queryKey: ["admin", "reportes"] });
          toast.info("Questão corrigida. Agora marque o reporte como resolvido.");
        }}
      />
    </div>
  );
}

function CartaoReporte({
  token,
  reporte: r,
  onEditarQuestao,
}: {
  token: string;
  reporte: ReporteAdmin;
  onEditarQuestao: (q: QuestaoRow) => void;
}) {
  const atualizar = useServerFn(atualizarReporte);
  const queryClient = useQueryClient();
  const [anotacao, setAnotacao] = useState(r.resposta_admin ?? "");
  const [todos, setTodos] = useState(r.abertosNaQuestao > 1);

  const mut = useMutation({
    mutationFn: (status: StatusReporte) =>
      atualizar({
        data: {
          token,
          id: r.id,
          status,
          resposta: anotacao,
          todosDaQuestao: status !== "aberto" && todos && r.abertosNaQuestao > 1,
        },
      }),
    onSuccess: async (_x, status) => {
      toast.success(
        status === "resolvido"
          ? "Reporte marcado como resolvido."
          : status === "descartado"
            ? "Reporte descartado."
            : "Reporte reaberto.",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "reportes"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "resumo"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const q = r.questao;
  const gabaritoTexto = q?.alternativas.find((a) => a.letra === q.gabarito)?.texto;

  return (
    <li className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-card-foreground">
            {r.questao_id}
          </span>
          <span
            className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", COR_STATUS[r.status])}
          >
            {STATUS_REPORTE_LABEL[r.status]}
          </span>
          {r.abertosNaQuestao > 1 && (
            <span className="rounded bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              {r.abertosNaQuestao} reportes abertos nesta questão
            </span>
          )}
          {q && !q.ativa && (
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Questão inativa
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{dataHora(r.created_at)}</span>
      </div>

      <div className="rounded-md border border-border bg-secondary/30 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
          <Flag className="size-3.5 text-primary" />
          {MOTIVO_LABEL[r.motivo]}
        </p>
        {r.descricao ? (
          <p className="mt-1 whitespace-pre-line text-sm text-card-foreground/90">
            “{r.descricao}”
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Sem descrição.</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {r.autor?.nome ?? "Aluno"}
          {r.autor?.email ? ` · ${r.autor.email}` : ""}
          {r.tipoSimulado ? ` · durante simulado ${r.tipoSimulado}` : ""}
        </p>
      </div>

      {q ? (
        <div className="text-xs leading-relaxed text-muted-foreground">
          <p className="line-clamp-3 whitespace-pre-line text-card-foreground/90">{q.enunciado}</p>
          <p className="mt-1">
            Gabarito atual: <strong className="uppercase text-card-foreground">{q.gabarito}</strong>
            {gabaritoTexto ? ` — ${gabaritoTexto}` : ""}
          </p>
          {(q.fonte_norma || q.fonte_pagina) && (
            <p className="mt-0.5">
              Fonte:{" "}
              {[q.fonte_norma, q.fonte_artigo, q.fonte_pagina ? `p. ${q.fonte_pagina}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-destructive">A questão não existe mais no banco.</p>
      )}

      {r.status === "aberto" ? (
        <div className="space-y-2 border-t border-border pt-3">
          <input
            value={anotacao}
            onChange={(e) => setAnotacao(e.target.value)}
            maxLength={2000}
            placeholder="Anotação interna (opcional): o que foi feito"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
          {r.abertosNaQuestao > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={todos}
                onChange={(e) => setTodos(e.target.checked)}
                className="accent-primary"
              />
              Aplicar a todos os {r.abertosNaQuestao} reportes abertos desta questão
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {q && (
              <button
                type="button"
                onClick={() => onEditarQuestao(q)}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Pencil className="size-3.5" /> Abrir e corrigir questão
              </button>
            )}
            <button
              type="button"
              disabled={mut.isPending}
              onClick={() => mut.mutate("descartado")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
            >
              <XCircle className="size-3.5" /> Descartar (sem erro)
            </button>
            <button
              type="button"
              disabled={mut.isPending}
              onClick={() => mut.mutate("resolvido")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
            >
              {mut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Marcar como resolvido
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            {STATUS_REPORTE_LABEL[r.status]} em {dataHora(r.resolvido_em)}
            {r.resposta_admin ? ` · ${r.resposta_admin}` : ""}
          </span>
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() => mut.mutate("aberto")}
            className="font-medium text-primary hover:underline disabled:opacity-50"
          >
            Reabrir
          </button>
        </div>
      )}
    </li>
  );
}
