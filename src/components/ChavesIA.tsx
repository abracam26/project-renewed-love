import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeftRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  KeyRound,
  Loader2,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  obterChavesIA,
  removerChaveIA,
  salvarChaveIA,
  testarChavesIA,
  trocarChavesIA,
  type PosicaoChave,
} from "@/lib/chaves-ia.functions";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";

/**
 * Chave da API de IA (Gemini ou OpenAI): o admin cola a chave nova e salva, sem mexer
 * no projeto. Até duas chaves: se a principal falhar, a geração de questões
 * tenta sozinha pela reserva.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

const TITULO: Record<PosicaoChave, string> = {
  principal: "Chave principal",
  reserva: "Chave reserva",
};

function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ChavesIA({ token }: { token: string }) {
  const obter = useServerFn(obterChavesIA);
  const testar = useServerFn(testarChavesIA);
  const trocar = useServerFn(trocarChavesIA);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "chaves-ia"],
    queryFn: () => obter({ data: { token } }),
  });
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["admin", "chaves-ia"] });

  const mutTestar = useMutation({
    mutationFn: () => testar({ data: { token } }),
    onSuccess: async (r) => {
      if (r.mensagem) toast.error(r.mensagem);
      const ruins = r.resultados.filter((x) => !x.ok);
      if (r.resultados.length > 0 && ruins.length === 0) toast.success("Chave(s) funcionando.");
      for (const x of ruins) {
        toast.error(
          `${x.origem === "projeto" ? "Chave do projeto" : TITULO[x.origem]}: ${x.mensagem}`,
        );
      }
      await atualizar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const mutTrocar = useMutation({
    mutationFn: () => trocar({ data: { token } }),
    onSuccess: async () => {
      toast.success("Pronto: a reserva virou a principal, e a principal virou a reserva.");
      await atualizar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const d = query.data;
  const cadastradas = d?.chaves.filter((c) => c.configurada).length ?? 0;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <KeyRound className="size-5 text-primary" />
            Chave da API de IA (Gemini ou OpenAI)
          </h2>
          <p className="text-xs text-muted-foreground">
            Para trocar a chave, cole a nova e salve: a mudança vale na hora. Se a chave principal
            falhar, a geração de questões tenta sozinha pela reserva. A chave fica guardada só no
            servidor; aqui aparecem apenas o começo e o fim dela. O provedor é reconhecido pela
            própria chave: as da OpenAI começam com sk- e as do Gemini com AIza.{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              Chaves da OpenAI <ExternalLink className="size-3" />
            </a>{" "}
            ·{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              Chaves do Gemini <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cadastradas === 2 && (
            <button
              type="button"
              disabled={mutTrocar.isPending}
              onClick={() => {
                if (confirm("Trocar a chave principal pela reserva?")) mutTrocar.mutate();
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
            >
              <ArrowLeftRight className="size-3.5" /> Usar a reserva como principal
            </button>
          )}
          <button
            type="button"
            disabled={mutTestar.isPending || !d || (cadastradas === 0 && !d.chaveDoProjeto)}
            onClick={() => mutTestar.mutate()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
          >
            {mutTestar.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 text-primary" />
            )}
            Testar as chaves
          </button>
        </div>
      </div>

      {query.isPending ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
        </p>
      ) : query.isError || !d ? (
        <p className="py-4 text-sm text-destructive">{mensagemErro(query.error)}</p>
      ) : (
        <>
          {cadastradas === 0 && (
            <p className="mt-3 rounded-md border border-primary/50 bg-primary/10 p-3 text-xs text-card-foreground">
              {d.chaveDoProjeto
                ? "Nenhuma chave cadastrada aqui: hoje a geração usa a chave configurada no projeto. Cadastre a chave principal para trocar sem mexer no projeto."
                : "Nenhuma chave cadastrada: a geração de questões não funciona até você cadastrar a chave principal."}
            </p>
          )}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {d.chaves.map((c) => (
              <CartaoChave key={c.posicao} token={token} chave={c} onMudou={atualizar} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Modelo usado: {d.modelo}.</p>
        </>
      )}
    </section>
  );
}

type Chave = Awaited<ReturnType<typeof obterChavesIA>>["chaves"][number];

function CartaoChave({
  token,
  chave: c,
  onMudou,
}: {
  token: string;
  chave: Chave;
  onMudou: () => Promise<unknown>;
}) {
  const salvar = useServerFn(salvarChaveIA);
  const remover = useServerFn(removerChaveIA);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const limpa = valor.trim();
  const erroValor = !limpa
    ? null
    : /\s/.test(limpa)
      ? "A chave não pode ter espaços ou quebras de linha."
      : limpa.length < 20
        ? "A chave parece incompleta. Copie a chave inteira."
        : null;

  const mutSalvar = useMutation({
    mutationFn: () => salvar({ data: { token, posicao: c.posicao, chave: limpa } }),
    onSuccess: async (r) => {
      if (r.teste.ok) toast.success(`${TITULO[c.posicao]} salva e testada: ${r.teste.mensagem}`);
      else
        toast.warning(`${TITULO[c.posicao]} salva, mas o teste não passou: ${r.teste.mensagem}`, {
          duration: 10000,
        });
      setEditando(false);
      setValor("");
      await onMudou();
    },
    onError: (e) => toast.error(mensagemErro(e), { duration: 10000 }),
  });
  const mutRemover = useMutation({
    mutationFn: () => remover({ data: { token, posicao: c.posicao } }),
    onSuccess: async () => {
      toast.success(`${TITULO[c.posicao]} removida.`);
      await onMudou();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-card-foreground">{TITULO[c.posicao]}</p>
        {c.configurada &&
          (c.ultimoTesteOk === null ? (
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Ainda não testada
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
                c.ultimoTesteOk
                  ? "bg-success text-success-foreground"
                  : "bg-destructive text-destructive-foreground",
              )}
            >
              {c.ultimoTesteOk ? (
                <CircleCheck className="size-3" />
              ) : (
                <CircleX className="size-3" />
              )}
              {c.ultimoTesteOk ? "Funcionando" : "Com erro"}
            </span>
          ))}
      </div>

      {c.configurada ? (
        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <p className="text-sm text-card-foreground">
            <span className="font-mono">{c.mascara}</span>{" "}
            <span className="text-xs text-muted-foreground">({c.provedor})</span>
          </p>
          <p>
            Salva em {dataHora(c.atualizadoEm)}
            {c.atualizadoPor ? ` por ${c.atualizadoPor}` : ""}
          </p>
          <p>
            Último teste: {dataHora(c.ultimoTesteEm)}
            {c.ultimoTesteMsg && !c.ultimoTesteOk ? ` · ${c.ultimoTesteMsg}` : ""}
          </p>
          <p>Último uso na geração: {dataHora(c.ultimoUsoEm)}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {c.posicao === "principal"
            ? "Nenhuma chave principal cadastrada."
            : "Nenhuma reserva cadastrada. Opcional: use uma chave de outra conta ou projeto do Google, para o caso de a principal ficar sem saldo ou ser bloqueada."}
        </p>
      )}

      {editando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (limpa && !erroValor) mutSalvar.mutate();
          }}
          className="mt-3 space-y-2"
        >
          <label className="block text-xs text-muted-foreground">
            {c.configurada ? "Nova chave (substitui a atual)" : "Chave"}
            <input
              type="password"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Cole aqui a chave (sk-... da OpenAI ou AIza... do Gemini)"
              className={`mt-1 font-mono ${inputClass}`}
            />
          </label>
          {erroValor ? (
            <p className="text-xs text-destructive">{erroValor}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Antes de salvar, a chave é testada. Se o Google recusar, ela não é salva e a atual
              continua valendo.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditando(false);
                setValor("");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutSalvar.isPending || !limpa || Boolean(erroValor)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
            >
              {mutSalvar.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {mutSalvar.isPending ? "Testando e salvando..." : "Testar e salvar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
          >
            <KeyRound className="size-3.5" /> {c.configurada ? "Trocar chave" : "Cadastrar chave"}
          </button>
          {c.configurada && (
            <button
              type="button"
              disabled={mutRemover.isPending}
              onClick={() => {
                if (
                  confirm(
                    c.posicao === "principal"
                      ? "Remover a chave principal? Se houver reserva, só ela será usada."
                      : "Remover a chave reserva?",
                  )
                )
                  mutRemover.mutate();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
        </div>
      )}
    </div>
  );
}
