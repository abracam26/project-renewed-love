import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquareReply, Send } from "lucide-react";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/erros";
import {
  CATEGORIA_CHAMADO_LABEL,
  STATUS_CHAMADO,
  STATUS_CHAMADO_LABEL,
  type StatusChamado,
} from "@/lib/suporte";
import {
  alterarStatusChamado,
  listarChamados,
  responderChamado,
  type ChamadoAdmin,
} from "@/lib/suporte.functions";
import { cn } from "@/lib/utils";

/** Painel /admin/suporte: chamados abertos pelos alunos. */

type Filtro = StatusChamado | "todos";

const COR_STATUS: Record<StatusChamado, string> = {
  aberto: "bg-destructive/15 text-destructive",
  respondido: "bg-success/15 text-success",
  fechado: "bg-muted text-muted-foreground",
};

const ROTULO_FILTRO: Record<Filtro, string> = {
  aberto: "Abertos",
  respondido: "Respondidos",
  fechado: "Encerrados",
  todos: "Todos",
};

function dataHora(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function GestorSuporte({ token }: { token: string }) {
  const listar = useServerFn(listarChamados);
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  const query = useQuery({
    queryKey: ["admin", "chamados", filtro],
    queryFn: () => listar({ data: { token, status: filtro } }),
  });
  const totais = query.data?.totais;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([...STATUS_CHAMADO, "todos"] as Filtro[]).map((f) => (
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
            {ROTULO_FILTRO[f]}
            {f !== "todos" && totais ? ` (${totais[f]})` : ""}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <p className="panel flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando chamados...
        </p>
      ) : query.isError ? (
        <p className="panel p-6 text-center text-sm text-destructive">
          {mensagemErro(query.error)}
        </p>
      ) : (query.data?.chamados.length ?? 0) === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {filtro === "aberto" ? "Nenhum chamado aguardando resposta." : "Nenhum chamado aqui."}
        </p>
      ) : (
        <ul className="space-y-3">
          {query.data?.chamados.map((c) => (
            <CartaoChamado key={c.id} token={token} chamado={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoChamado({ token, chamado: c }: { token: string; chamado: ChamadoAdmin }) {
  const responder = useServerFn(responderChamado);
  const alterar = useServerFn(alterarStatusChamado);
  const queryClient = useQueryClient();
  const [resposta, setResposta] = useState(c.resposta ?? "");

  const atualizar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "chamados"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "resumo"] });
  };

  const mutResponder = useMutation({
    mutationFn: (encerrar: boolean) => responder({ data: { token, id: c.id, resposta, encerrar } }),
    onSuccess: async (_r, encerrar) => {
      toast.success(encerrar ? "Resposta enviada e chamado encerrado." : "Resposta enviada.");
      await atualizar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const mutStatus = useMutation({
    mutationFn: (status: StatusChamado) => alterar({ data: { token, id: c.id, status } }),
    onSuccess: async () => {
      toast.success("Chamado atualizado.");
      await atualizar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const ocupado = mutResponder.isPending || mutStatus.isPending;

  return (
    <li className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{c.titulo}</p>
          <p className="text-[11px] text-muted-foreground">
            {CATEGORIA_CHAMADO_LABEL[c.categoria]} · {dataHora(c.created_at)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {c.autor?.nome ?? "Aluno"}
            {c.autor?.email ? ` · ${c.autor.email}` : ""}
          </p>
        </div>
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", COR_STATUS[c.status])}>
          {STATUS_CHAMADO_LABEL[c.status]}
        </span>
      </div>

      <p className="whitespace-pre-line rounded-md bg-secondary/40 p-3 text-sm text-card-foreground">
        {c.mensagem}
      </p>

      {c.status === "fechado" && c.resposta ? (
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-xs text-card-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <MessageSquareReply className="size-3.5 text-success" /> Resposta enviada em{" "}
            {dataHora(c.respondido_em)}
          </p>
          <p className="mt-1 whitespace-pre-line">{c.resposta}</p>
        </div>
      ) : c.status !== "fechado" ? (
        <div className="space-y-2">
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Escreva a resposta. O aluno vê na página Suporte."
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          {c.status === "respondido" && c.respondido_em && (
            <p className="text-[11px] text-muted-foreground">
              Respondido em {dataHora(c.respondido_em)}. Se enviar de novo, a resposta é
              substituída.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {c.status === "fechado" ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => mutStatus.mutate(c.resposta ? "respondido" : "aberto")}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
          >
            Reabrir
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => mutStatus.mutate("fechado")}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
            >
              Encerrar sem responder
            </button>
            <button
              type="button"
              disabled={ocupado || resposta.trim().length < 2}
              onClick={() => mutResponder.mutate(true)}
              className="rounded-md border border-primary/60 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              Responder e encerrar
            </button>
            <button
              type="button"
              disabled={ocupado || resposta.trim().length < 2}
              onClick={() => mutResponder.mutate(false)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
            >
              {mutResponder.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Responder
            </button>
          </>
        )}
      </div>
    </li>
  );
}
