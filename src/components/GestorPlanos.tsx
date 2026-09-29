import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Save, Sparkle, Tag, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mensagemErro } from "@/lib/erros";
import {
  centavosParaTexto,
  descreverDuracao,
  FORMAS_PAGAMENTO,
  formatarReais,
  METODO_PAGAMENTO_LABEL,
  periodoDoPlano,
  reaisParaCentavos,
  TIPO_ACESSO_LABEL,
  TIPOS_ACESSO,
  UNIDADES_DURACAO,
  type FormaPagamento,
  type TipoAcesso,
  type UnidadeDuracao,
} from "@/lib/pagamentos";
import { excluirPlano, listarPlanosAdmin, salvarPlano } from "@/lib/pagamentos.functions";
import { cn } from "@/lib/utils";

/**
 * Catálogo de planos à venda (/admin/pagamentos): nome, preço, duração e
 * categoria de acesso de cada plano que o aluno pode comprar na página Planos.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-card-foreground";

const MAX_BENEFICIOS = 12;
const PRECO_MAXIMO = 100000000;

type PlanoAdmin = Awaited<ReturnType<typeof listarPlanosAdmin>>["planos"][number];

/** Campos do formulário (números ficam como texto enquanto o admin digita). */
type Form = {
  id: string | null;
  nome: string;
  tipoAcesso: TipoAcesso;
  duracaoQuantidade: string;
  duracaoUnidade: UnidadeDuracao;
  preco: string;
  descricao: string;
  beneficios: string;
  formasPagamento: FormaPagamento[];
  parcelasMax: number;
  destaque: boolean;
  ordem: string;
  ativo: boolean;
};

function formNovo(ordem: number): Form {
  return {
    id: null,
    nome: "",
    tipoAcesso: "mensal",
    duracaoQuantidade: "1",
    duracaoUnidade: "meses",
    preco: "",
    descricao: "",
    beneficios: "",
    formasPagamento: [...FORMAS_PAGAMENTO],
    parcelasMax: 1,
    destaque: false,
    ordem: String(ordem),
    ativo: false,
  };
}

function formDoPlano(p: PlanoAdmin): Form {
  return {
    id: p.id,
    nome: p.nome,
    tipoAcesso: p.tipoAcesso,
    duracaoQuantidade: String(p.duracaoQuantidade),
    duracaoUnidade: p.duracaoUnidade,
    preco: p.precoCentavos > 0 ? centavosParaTexto(p.precoCentavos) : "",
    descricao: p.descricao,
    beneficios: p.beneficios.join("\n"),
    formasPagamento: FORMAS_PAGAMENTO.filter((f) => p.formasPagamento.includes(f)),
    parcelasMax: p.parcelasMax,
    destaque: p.destaque,
    ordem: String(p.ordem),
    ativo: p.ativo,
  };
}

function Selo({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function GestorPlanos({ token }: { token: string }) {
  const listar = useServerFn(listarPlanosAdmin);
  const excluir = useServerFn(excluirPlano);
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Form | null>(null);

  const query = useQuery({
    queryKey: ["admin", "planos"],
    queryFn: () => listar({ data: { token } }),
  });

  const mutExcluir = useMutation({
    mutationFn: (id: string) => excluir({ data: { token, id } }),
    onSuccess: async () => {
      toast.success("Plano excluído.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "planos"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const planos = query.data?.planos ?? [];
  const nenhumAtivo = query.isSuccess && !planos.some((p) => p.ativo && p.precoCentavos > 0);
  const proximaOrdem = Math.min(999, planos.reduce((m, p) => Math.max(m, p.ordem), -1) + 1);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <Tag className="size-5 text-primary" />
            Planos à venda
          </h2>
          <p className="text-xs text-muted-foreground">
            O que aparece para o aluno na página Planos. Só planos ativos e com preço aparecem. O
            preço vale para novos pedidos; pedidos já feitos guardam o valor da época.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando(formNovo(proximaOrdem))}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
        >
          <Plus className="size-4" /> Novo plano
        </button>
      </div>

      {nenhumAtivo && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-sm text-card-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            <strong>Nenhum plano ativo:</strong> a página Planos mostra &quot;Contratação online em
            breve&quot; e o contato da ABRACAM. Revise os preços e ative os planos.
          </p>
        </div>
      )}

      {query.isPending ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando planos...
        </p>
      ) : query.isError ? (
        <p className="py-6 text-sm text-destructive">{mensagemErro(query.error)}</p>
      ) : planos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum plano cadastrado. Clique em &quot;Novo plano&quot; para criar o primeiro.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {planos.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-card-foreground">{p.nome}</p>
                    {p.ativo ? (
                      <Selo className="bg-success/15 text-success">Ativo</Selo>
                    ) : (
                      <Selo className="bg-muted text-muted-foreground">Desativado</Selo>
                    )}
                    {p.destaque && (
                      <Selo className="bg-primary/15 text-primary">
                        <Sparkle className="size-3" /> Destaque
                      </Selo>
                    )}
                    <Selo className="border border-border text-muted-foreground">
                      Ordem {p.ordem}
                    </Selo>
                  </div>
                  <p className="text-sm text-card-foreground">
                    {p.precoCentavos > 0 ? (
                      <strong>{formatarReais(p.precoCentavos)}</strong>
                    ) : (
                      <strong className="text-destructive">Sem preço</strong>
                    )}
                    {" · "}
                    {descreverDuracao(p.duracaoQuantidade, p.duracaoUnidade)}
                    {" · "}
                    Categoria de acesso: {TIPO_ACESSO_LABEL[p.tipoAcesso]}
                  </p>
                  {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    {p.beneficios.length === 0
                      ? "Nenhum benefício listado"
                      : `${p.beneficios.length} benefício${p.beneficios.length === 1 ? "" : "s"} listado${p.beneficios.length === 1 ? "" : "s"}`}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditando(formDoPlano(p))}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                    {!p.temPedidos && (
                      <button
                        type="button"
                        disabled={mutExcluir.isPending}
                        onClick={() => {
                          if (
                            confirm(`Excluir o plano "${p.nome}"? Esta ação não pode ser desfeita.`)
                          )
                            mutExcluir.mutate(p.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" /> Excluir
                      </button>
                    )}
                  </div>
                  {p.temPedidos && (
                    <p className="text-[11px] text-muted-foreground">
                      Tem pedidos: desative em vez de excluir
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(editando)} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-2xl">
          {editando && (
            <EditorPlano
              key={editando.id ?? "novo"}
              token={token}
              inicial={editando}
              onFechar={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------
// Diálogo de criação e edição de um plano
// ---------------------------------------------------------------------
function EditorPlano({
  token,
  inicial,
  onFechar,
}: {
  token: string;
  inicial: Form;
  onFechar: () => void;
}) {
  const salvar = useServerFn(salvarPlano);
  const queryClient = useQueryClient();
  const [f, setF] = useState<Form>(inicial);
  const [tentou, setTentou] = useState(false);

  function set<K extends keyof Form>(campo: K, valor: Form[K]) {
    setF((v) => ({ ...v, [campo]: valor }));
  }

  // Validação (as mesmas regras do servidor, com mensagens na hora)
  const nome = f.nome.trim();
  const erroNome =
    nome.length < 3
      ? "O nome precisa ter pelo menos 3 letras."
      : nome.length > 60
        ? "Nome muito longo."
        : null;

  const quantidade = Number(f.duracaoQuantidade);
  const maxDuracao = f.duracaoUnidade === "meses" ? 120 : 3660;
  const erroDuracao =
    f.duracaoQuantidade.trim() === "" || !Number.isInteger(quantidade) || quantidade < 1
      ? "Informe a duração com um número inteiro (1 ou mais)."
      : quantidade > maxDuracao
        ? `Duração máxima: ${maxDuracao} ${f.duracaoUnidade}.`
        : null;

  const precoTexto = f.preco.trim();
  const precoCentavos = precoTexto ? reaisParaCentavos(precoTexto) : 0;
  const erroPreco =
    precoCentavos === null
      ? "Preço inválido. Escreva só o valor em reais, por exemplo 49,90."
      : precoCentavos > PRECO_MAXIMO
        ? "Preço muito alto."
        : null;
  const semPreco = precoCentavos === 0;

  const beneficios = f.beneficios
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
  const erroBeneficios =
    beneficios.length > MAX_BENEFICIOS
      ? `No máximo ${MAX_BENEFICIOS} benefícios (agora são ${beneficios.length}).`
      : beneficios.some((b) => b.length > 150)
        ? "Cada benefício pode ter até 150 caracteres."
        : null;

  const erroFormas =
    f.formasPagamento.length === 0 ? "Marque pelo menos uma forma de pagamento online." : null;

  const ordem = f.ordem.trim() === "" ? 0 : Number(f.ordem);
  const erroOrdem =
    !Number.isInteger(ordem) || ordem < 0 || ordem > 999
      ? "A ordem precisa ser um número de 0 a 999."
      : null;

  const erroAtivo =
    f.ativo && semPreco
      ? "Para deixar o plano disponível para compra, informe um preço maior que zero."
      : null;

  const erro =
    erroNome ?? erroDuracao ?? erroPreco ?? erroBeneficios ?? erroFormas ?? erroOrdem ?? erroAtivo;

  const mut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          token,
          id: f.id,
          nome,
          descricao: f.descricao.trim(),
          beneficios,
          tipoAcesso: f.tipoAcesso,
          duracaoQuantidade: quantidade,
          duracaoUnidade: f.duracaoUnidade,
          precoCentavos: precoCentavos ?? 0,
          formasPagamento: f.formasPagamento,
          parcelasMax: f.parcelasMax,
          destaque: f.destaque,
          ordem,
          ativo: f.ativo,
        },
      }),
    onSuccess: async () => {
      toast.success(
        f.ativo
          ? "Plano salvo. Ele já aparece na página Planos."
          : "Plano salvo. Ele está desativado e não aparece para o aluno.",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "planos"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  function alternarForma(forma: FormaPagamento, marcada: boolean) {
    set(
      "formasPagamento",
      FORMAS_PAGAMENTO.filter((x) => (x === forma ? marcada : f.formasPagamento.includes(x))),
    );
  }

  const aceitaCartao = f.formasPagamento.includes("cartao");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTentou(true);
        if (!erro) mut.mutate();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{f.id ? "Editar plano" : "Novo plano"}</DialogTitle>
        <DialogDescription>
          O aluno vê o nome, o preço, a duração, a descrição e os benefícios na página Planos.
        </DialogDescription>
      </DialogHeader>

      <label className="block text-xs text-muted-foreground">
        Nome do plano
        <input
          value={f.nome}
          onChange={(e) => set("nome", e.target.value)}
          maxLength={60}
          placeholder="Ex.: Plano Mensal"
          className={`mt-1 ${inputClass}`}
        />
        {erroNome && (tentou || f.nome.length > 0) && (
          <span className="mt-1 block text-destructive">{erroNome}</span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Categoria de acesso
          <select
            value={f.tipoAcesso}
            onChange={(e) => set("tipoAcesso", e.target.value as TipoAcesso)}
            className={`mt-1 ${inputClass}`}
          >
            {TIPOS_ACESSO.map((t) => (
              <option key={t} value={t}>
                {TIPO_ACESSO_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px]">
            Define as regras de acesso e aparece para o aluno se o nome do plano não estiver
            disponível.
          </span>
        </label>

        <div className="text-xs text-muted-foreground">
          <span>Duração do acesso</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={1}
              max={maxDuracao}
              step={1}
              value={f.duracaoQuantidade}
              onChange={(e) => set("duracaoQuantidade", e.target.value)}
              aria-label="Quantidade"
              className={`${inputClass} w-24`}
            />
            <select
              value={f.duracaoUnidade}
              onChange={(e) => set("duracaoUnidade", e.target.value as UnidadeDuracao)}
              aria-label="Unidade"
              className={`${inputClass} flex-1`}
            >
              {UNIDADES_DURACAO.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          {erroDuracao ? (
            <span className="mt-1 block text-destructive">{erroDuracao}</span>
          ) : (
            <span className="mt-1 block text-[11px]">
              Acesso por {descreverDuracao(quantidade, f.duracaoUnidade)} a cada compra. Ex.: 1 mês,
              12 meses, 30 dias.
            </span>
          )}
        </div>
      </div>

      <label className="block text-xs text-muted-foreground">
        Preço (em reais)
        <span className="mt-1 flex items-center gap-2">
          <span className="text-sm text-card-foreground">R$</span>
          <input
            value={f.preco}
            onChange={(e) => set("preco", e.target.value)}
            inputMode="decimal"
            placeholder="49,90"
            className={`${inputClass} max-w-40`}
          />
        </span>
        {erroPreco ? (
          <span className="mt-1 block text-destructive">{erroPreco}</span>
        ) : semPreco ? (
          <span className="mt-1 block text-[11px]">
            Sem preço, o plano fica salvo mas não pode ser ativado.
          </span>
        ) : (
          <span className="mt-1 block text-[11px]">
            O aluno verá:{" "}
            {erroDuracao
              ? formatarReais(precoCentavos)
              : `${formatarReais(precoCentavos)} ${periodoDoPlano(quantidade, f.duracaoUnidade)}`}
            . Vale para novos pedidos.
          </span>
        )}
      </label>

      <label className="block text-xs text-muted-foreground">
        Descrição curta (opcional, {f.descricao.length}/300)
        <textarea
          value={f.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Ex.: Acesso completo ao simulador por 1 mês."
          className={`mt-1 resize-y ${inputClass}`}
        />
      </label>

      <label className="block text-xs text-muted-foreground">
        Benefícios (um por linha, até {MAX_BENEFICIOS}; agora: {beneficios.length})
        <textarea
          value={f.beneficios}
          onChange={(e) => set("beneficios", e.target.value)}
          rows={5}
          placeholder={
            "Simulados ABT1 e ABT2 completos\nRelatórios de desempenho por tema\nParticipação opcional no ranking"
          }
          className={`mt-1 resize-y ${inputClass}`}
        />
        {erroBeneficios ? (
          <span className="mt-1 block text-destructive">{erroBeneficios}</span>
        ) : (
          <span className="mt-1 block text-[11px]">Linhas em branco são ignoradas.</span>
        )}
      </label>

      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-card-foreground">
          Pagamento online (Pagar.me)
        </legend>
        <p className="text-[11px] text-muted-foreground">
          Usados quando o pagamento online (Pagar.me) for ligado.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          {FORMAS_PAGAMENTO.map((forma) => (
            <label key={forma} className="flex items-center gap-2 text-sm text-card-foreground">
              <input
                type="checkbox"
                checked={f.formasPagamento.includes(forma)}
                onChange={(e) => alternarForma(forma, e.target.checked)}
                className="size-4 accent-primary"
              />
              {METODO_PAGAMENTO_LABEL[forma]}
            </label>
          ))}
        </div>
        {erroFormas && <p className="mt-1 text-xs text-destructive">{erroFormas}</p>}
        <label className="mt-3 block max-w-60 text-xs text-muted-foreground">
          Parcelas máximas no cartão
          <select
            value={f.parcelasMax}
            onChange={(e) => set("parcelasMax", Number(e.target.value))}
            disabled={!aceitaCartao}
            className={`mt-1 ${inputClass} disabled:opacity-50`}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1x (sem parcelar)" : `Até ${n}x`}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Ordem na página
          <input
            type="number"
            min={0}
            max={999}
            step={1}
            value={f.ordem}
            onChange={(e) => set("ordem", e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
          {erroOrdem ? (
            <span className="mt-1 block text-destructive">{erroOrdem}</span>
          ) : (
            <span className="mt-1 block text-[11px]">Números menores aparecem primeiro.</span>
          )}
        </label>

        <div className="space-y-2 pt-4">
          <label className="flex items-center gap-2 text-sm text-card-foreground">
            <input
              type="checkbox"
              checked={f.destaque}
              onChange={(e) => set("destaque", e.target.checked)}
              className="size-4 accent-primary"
            />
            Mostrar como &quot;Mais escolhido&quot;
          </label>
          <label className="flex items-center gap-2 text-sm text-card-foreground">
            <input
              type="checkbox"
              checked={f.ativo}
              onChange={(e) => set("ativo", e.target.checked)}
              className="size-4 accent-primary"
            />
            Disponível para compra
          </label>
          {erroAtivo ? (
            <p className="text-xs text-destructive">{erroAtivo}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {f.ativo
                ? "O plano aparece para o aluno na página Planos."
                : "Desativado: o plano fica salvo, mas não aparece para o aluno."}
            </p>
          )}
        </div>
      </div>

      {tentou && erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Corrija antes de salvar: {erro}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
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
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {f.id ? "Salvar alterações" : "Criar plano"}
        </button>
      </div>
    </form>
  );
}
