import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Pencil,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import { EditorQuestao } from "@/components/EditorQuestao";
import { toast } from "sonner";
import { atualizarQuestao, excluirQuestoes, listarQuestoes } from "@/lib/questoes.functions";
import {
  DIFICULDADES,
  NIVEIS,
  TEMAS,
  type Dificuldade,
  type Nivel,
  type QuestaoRow,
} from "@/lib/questoes-schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const POR_PAGINA = 20;

const selectClass =
  "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

export function GestorQuestoes({ token }: { token: string }) {
  const [tema, setTema] = useState<number | null>(null);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [dificuldade, setDificuldade] = useState<Dificuldade | null>(null);
  const [ativa, setAtiva] = useState<boolean | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [detalhe, setDetalhe] = useState<QuestaoRow | null>(null);
  const [excluindo, setExcluindo] = useState<QuestaoRow | null>(null);
  const [editando, setEditando] = useState<QuestaoRow | null>(null);

  const listar = useServerFn(listarQuestoes);
  const atualizar = useServerFn(atualizarQuestao);
  const excluir = useServerFn(excluirQuestoes);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "questoes", { tema, nivel, dificuldade, ativa, buscaAplicada, pagina }],
    queryFn: () =>
      listar({
        data: {
          token,
          tema,
          nivel,
          dificuldade,
          ativa,
          status: null,
          busca: buscaAplicada,
          pagina,
          porPagina: POR_PAGINA,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const mutAtiva = useMutation({
    mutationFn: (q: QuestaoRow) => atualizar({ data: { token, id: q.id, ativa: !q.ativa } }),
    onSuccess: (_r, q) => {
      toast.success(q.ativa ? `${q.id} desativada.` : `${q.id} ativada.`);
      void invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar."),
  });

  const mutExcluir = useMutation({
    mutationFn: (id: string) => excluir({ data: { token, ids: [id] } }),
    onSuccess: (_r, id) => {
      toast.success(`${id} excluída.`);
      setExcluindo(null);
      void invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir."),
  });

  const total = query.data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const questoes = query.data?.questoes ?? [];

  function aplicarFiltro<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setPagina(1);
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Banco de questões</h2>
          <p className="text-xs text-muted-foreground">
            {total} questão{total === 1 ? "" : "es"} encontrada{total === 1 ? "" : "s"}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            aplicarFiltro(setBuscaAplicada, busca.trim());
          }}
          className="flex items-center gap-2"
        >
          <span className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="ID, enunciado ou subtema"
              className="w-48 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </span>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={tema ?? ""}
          onChange={(e) => aplicarFiltro(setTema, e.target.value ? Number(e.target.value) : null)}
          className={selectClass}
        >
          <option value="">Todos os temas</option>
          {([1, 2, 3, 4] as const).map((t) => (
            <option key={t} value={t}>
              Tema {t} · {TEMAS[t]}
            </option>
          ))}
        </select>
        <select
          value={nivel ?? ""}
          onChange={(e) => aplicarFiltro(setNivel, (e.target.value || null) as Nivel | null)}
          className={selectClass}
        >
          <option value="">Todos os níveis</option>
          {NIVEIS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={dificuldade ?? ""}
          onChange={(e) =>
            aplicarFiltro(setDificuldade, (e.target.value || null) as Dificuldade | null)
          }
          className={selectClass}
        >
          <option value="">Todas as dificuldades</option>
          {DIFICULDADES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={ativa === null ? "" : ativa ? "1" : "0"}
          onChange={(e) =>
            aplicarFiltro(setAtiva, e.target.value === "" ? null : e.target.value === "1")
          }
          className={selectClass}
        >
          <option value="">Ativas e inativas</option>
          <option value="1">Somente ativas</option>
          <option value="0">Somente inativas</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Tema</th>
              <th className="px-3 py-2 font-medium">Nível</th>
              <th className="px-3 py-2 font-medium">Dific.</th>
              <th className="px-3 py-2 font-medium">Enunciado</th>
              <th className="px-3 py-2 font-medium">Gab.</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin text-primary" />
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-destructive">
                  {query.error instanceof Error ? query.error.message : "Falha ao carregar."}
                </td>
              </tr>
            )}
            {!query.isPending && !query.isError && questoes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhuma questão encontrada. Importe um lote acima.
                </td>
              </tr>
            )}
            {questoes.map((q) => (
              <tr
                key={q.id}
                className={`border-b border-border/60 last:border-0 ${q.ativa ? "" : "opacity-60"}`}
              >
                <td className="px-3 py-2 font-mono text-card-foreground">{q.id}</td>
                <td className="px-3 py-2 text-card-foreground">{q.tema}</td>
                <td className="px-3 py-2 text-card-foreground">{q.nivel}</td>
                <td className="px-3 py-2 text-card-foreground">{q.dificuldade}</td>
                <td
                  className="max-w-[360px] truncate px-3 py-2 text-card-foreground"
                  title={q.enunciado}
                >
                  {q.enunciado}
                </td>
                <td className="px-3 py-2 font-semibold uppercase text-primary">{q.gabarito}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      q.ativa ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {q.ativa ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setDetalhe(q)}
                      aria-label={`Ver ${q.id}`}
                      className="rounded-md p-1.5 text-card-foreground hover:bg-accent"
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(q)}
                      aria-label={`Editar ${q.id}`}
                      className="rounded-md p-1.5 text-primary hover:bg-accent"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mutAtiva.mutate(q)}
                      disabled={mutAtiva.isPending}
                      aria-label={q.ativa ? `Desativar ${q.id}` : `Ativar ${q.id}`}
                      className="rounded-md p-1.5 text-primary hover:bg-accent disabled:opacity-50"
                    >
                      <Power className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(q)}
                      aria-label={`Excluir ${q.id}`}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-3 py-1.5 font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft className="size-3.5" /> Anterior
          </button>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-3 py-1.5 font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
          >
            Próxima <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <Dialog open={detalhe !== null} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{detalhe.id}</DialogTitle>
                <DialogDescription>
                  Tema {detalhe.tema} · {detalhe.tema_nome}
                  {detalhe.subtema ? ` · ${detalhe.subtema}` : ""} · {detalhe.nivel} ·{" "}
                  {detalhe.dificuldade}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-card-foreground">{detalhe.enunciado}</p>
              <ul className="space-y-2">
                {detalhe.alternativas.map((a) => (
                  <li
                    key={a.letra}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      a.letra === detalhe.gabarito
                        ? "border-success/50 bg-success/10 text-card-foreground"
                        : "border-border text-card-foreground/80"
                    }`}
                  >
                    <span className="mr-2 font-semibold uppercase">({a.letra})</span>
                    {a.texto}
                  </li>
                ))}
              </ul>
              {detalhe.explicacao && (
                <div className="rounded-md bg-secondary/60 p-3 text-xs leading-relaxed text-card-foreground">
                  <p className="mb-1 font-semibold">Explicação</p>
                  {detalhe.explicacao}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {[
                  detalhe.fonte_norma,
                  detalhe.fonte_artigo,
                  detalhe.fonte_pagina ? `p. ${detalhe.fonte_pagina} do material` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Sem fonte informada"}
                {detalhe.tags.length > 0 ? ` · Tags: ${detalhe.tags.join(", ")}` : ""}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluindo !== null} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {excluindo?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              A questão será removida permanentemente do banco. Se preferir apenas tirá-la dos
              simulados, use "desativar".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (excluindo) mutExcluir.mutate(excluindo.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mutExcluir.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditorQuestao
        token={token}
        questao={editando}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        onSalvo={() => void invalidar()}
      />
    </section>
  );
}
