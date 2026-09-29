import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  TriangleAlert,
  Undo2,
} from "lucide-react";
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
  FILTROS_PEDIDO,
  METODOS_PAGAMENTO,
  METODO_PAGAMENTO_LABEL,
  STATUS_PAGAMENTO_LABEL,
  STATUS_PEDIDO_LABEL,
  centavosParaTexto,
  descreverDuracao,
  formatarReais,
  reaisParaCentavos,
  type FiltroPedido,
  type MetodoPagamento,
  type StatusPedido,
} from "@/lib/pagamentos";
import {
  cancelarPedidoAdmin,
  confirmarPagamento,
  estornarPedido,
  listarPedidos,
  resolverRevisao,
  type PedidoAdmin,
} from "@/lib/pagamentos.functions";
import {
  acessoAtivo,
  formatarDataBR,
  hojeSaoPaulo,
  nomeDoPlano,
  novaValidade,
  somarDias,
} from "@/lib/planos";
import { cn } from "@/lib/utils";

/**
 * Painel de pedidos em /admin/pagamentos (Etapa 1): o aluno faz o pedido na
 * página Planos e paga por fora; aqui o admin confirma o pagamento (o acesso
 * é liberado na hora), cancela, estorna ou resolve pagamentos em revisão.
 */

type Pagamento = PedidoAdmin["pagamentos"][number];
type Perfil = PedidoAdmin["perfil"];

type Acao =
  | { tipo: "confirmar" | "cancelar" | "estornar"; pedido: PedidoAdmin }
  | { tipo: "resolver" | "liberar"; pedido: PedidoAdmin; pagamento: Pagamento };

type PropsAcao = { token: string; pedido: PedidoAdmin; onFechar: () => void };

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

const botaoPrimario =
  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-50";

const botaoPerigo =
  "inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50";

const ROTULO_FILTRO: Record<FiltroPedido, string> = {
  pendente: "Aguardando pagamento",
  revisao: "Precisa de revisão",
  pago: "Pagos",
  cancelado: "Cancelados / vencidos",
  estornado: "Estornados",
  todos: "Todos",
};

const LISTA_VAZIA: Record<FiltroPedido, string> = {
  pendente: "Nenhum pedido aguardando pagamento.",
  revisao: "Nenhum pagamento precisa de revisão.",
  pago: "Nenhum pedido pago ainda.",
  cancelado: "Nenhum pedido cancelado ou com prazo vencido.",
  estornado: "Nenhum pedido estornado.",
  todos: "Nenhum pedido feito ainda.",
};

const COR_STATUS: Record<StatusPedido, string> = {
  // "Âmbar" = dourado do tema (o design system não usa cores fixas)
  pendente: "bg-primary/15 text-primary",
  pago: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
  estornado: "bg-destructive/15 text-destructive",
};

const FUSO = "America/Sao_Paulo";

/** Data e hora no fuso de São Paulo: "28/09/2026 14:30". */
function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FUSO,
  });
}

/** Só a data de um momento, no fuso de São Paulo: "28/09/2026". */
function dataDoMomento(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

/** Termina a frase com ponto, sem duplicar ("Motivo." e não "Motivo.."). */
function comPonto(texto: string) {
  const t = texto.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function nomeMetodo(m: MetodoPagamento | null | undefined) {
  return m ? (METODO_PAGAMENTO_LABEL[m] ?? m) : "Não informada";
}

/** Dias corridos de uma data AAAA-MM-DD até outra: ("2026-09-28", "2026-09-30") = 2. */
function diasEntre(de: string, ate: string) {
  const utc = (v: string) => {
    const [a, m, d] = v.slice(0, 10).split("-").map(Number);
    return Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

/** Compara duas datas AAAA-MM-DD (ou vazias) como o banco faz com IS NOT DISTINCT FROM. */
function mesmaData(a: string | null | undefined, b: string | null | undefined) {
  return (a ? a.slice(0, 10) : null) === (b ? b.slice(0, 10) : null);
}

/**
 * Pagamento já recebido (gravado como pago, em revisão ou com a revisão já
 * resolvida) num pedido que ainda não liberou acesso: dá para liberar o acesso
 * com ele, e a confirmação comum fica bloqueada (gravaria um segundo pagamento).
 * Mesma regra do banco (registrar_pagamento_pedido).
 */
function podeLiberarCom(p: PedidoAdmin, g: Pagamento) {
  return g.status === "pago" && p.status !== "pago" && p.status !== "estornado";
}

/** Situação atual do acesso do aluno dono do pedido (userId null = conta excluída). */
function descreverAcesso(userId: string | null, perfil: Perfil): { texto: string; classe: string } {
  if (userId === null) return { texto: "conta excluída", classe: "text-destructive" };
  if (!perfil) return { texto: "não foi possível ler o acesso", classe: "text-destructive" };
  if (perfil.plano === "inativo") return { texto: "conta bloqueada", classe: "text-destructive" };
  if (acessoAtivo(perfil.plano, perfil.planoValidade)) {
    return {
      texto: `${nomeDoPlano(perfil.plano, perfil.planoNome)} até ${formatarDataBR(perfil.planoValidade)}`,
      classe: "text-success",
    };
  }
  if ((perfil.plano === "mensal" || perfil.plano === "anual") && perfil.planoValidade) {
    return {
      texto: `sem plano ativo (venceu em ${formatarDataBR(perfil.planoValidade)})`,
      classe: "text-muted-foreground",
    };
  }
  return { texto: "sem plano ativo", classe: "text-muted-foreground" };
}

/**
 * Atualiza a lista de pedidos, o resumo do painel admin e as telas de
 * usuários depois de uma ação (inclusive quando ela falha: o pedido pode ter
 * mudado enquanto o diálogo estava aberto).
 */
function useAtualizarPedidos() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "pedidos"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "resumo"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "usuario"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] }),
    ]);
}

// ---------------------------------------------------------------------
// Lista de pedidos
// ---------------------------------------------------------------------
export function GestorPedidos({ token }: { token: string }) {
  const listar = useServerFn(listarPedidos);
  const [filtro, setFiltro] = useState<FiltroPedido>("pendente");
  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState<Acao | null>(null);

  const query = useQuery({
    queryKey: ["admin", "pedidos", filtro, busca, pagina],
    queryFn: () => listar({ data: { token, filtro, busca, pagina } }),
    placeholderData: keepPreviousData,
  });

  const totais = query.data?.totais;
  const total = query.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / (query.data?.porPagina ?? 30)));
  const pedidos = query.data?.pedidos ?? [];

  // Se a página atual ficou vazia (ex.: o último pedido dela saiu do filtro), volta
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && pagina > paginas) setPagina(paginas);
  }, [query.data, query.isPlaceholderData, pagina, paginas]);

  function trocarFiltro(f: FiltroPedido) {
    setFiltro(f);
    setPagina(1);
  }

  function limparBusca() {
    setTermo("");
    setBusca("");
    setPagina(1);
  }

  const fechar = () => setAcao(null);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <Receipt className="size-5 text-primary" />
            Pedidos
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Pedidos feitos pelos alunos na página Planos. Enquanto o pagamento online não estiver
            ligado, confirme aqui quando o pagamento chegar: o acesso do aluno é liberado na hora,
            somando os dias do plano.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
          Atualizar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTROS_PEDIDO.map((f) => {
          const n = f === "todos" ? null : totais?.[f];
          const alerta = f === "revisao" && (n ?? 0) > 0;
          return (
            <button
              key={f}
              type="button"
              onClick={() => trocarFiltro(f)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                filtro === f
                  ? "border-primary bg-primary text-primary-foreground shadow-gold"
                  : alerta
                    ? "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25"
                    : "border-border bg-card text-card-foreground hover:bg-accent",
              )}
            >
              {ROTULO_FILTRO[f]}
              {typeof n === "number" ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setBusca(termo.trim());
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            maxLength={100}
            placeholder="Código do pedido, nome ou e-mail do aluno"
            className={`${inputClass} py-2 pl-8`}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
        >
          Buscar
        </button>
        {busca && (
          <button
            type="button"
            onClick={limparBusca}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-card-foreground hover:bg-accent"
          >
            Limpar busca
          </button>
        )}
      </form>

      {query.data && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {total} pedido{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
          {busca ? ` para “${busca}”` : ""}
        </p>
      )}

      <div className="mt-4">
        {query.isPending ? (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Carregando pedidos...
          </p>
        ) : query.isError ? (
          <p className="p-6 text-center text-sm text-destructive">{mensagemErro(query.error)}</p>
        ) : pedidos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {busca ? `Nenhum pedido encontrado para “${busca}” neste filtro.` : LISTA_VAZIA[filtro]}
          </p>
        ) : (
          <ul
            className={cn("space-y-3 transition-opacity", query.isPlaceholderData && "opacity-60")}
          >
            {pedidos.map((p) => (
              <CartaoPedido key={p.id} pedido={p} onAcao={setAcao} />
            ))}
          </ul>
        )}
      </div>

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" /> Anterior
          </button>
          <span>
            Página {pagina} de {paginas}
          </span>
          <button
            type="button"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 disabled:opacity-40"
          >
            Próxima <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}

      {acao?.tipo === "confirmar" && (
        <ConfirmarPagamento token={token} pedido={acao.pedido} onFechar={fechar} />
      )}
      {acao?.tipo === "cancelar" && (
        <CancelarPedido token={token} pedido={acao.pedido} onFechar={fechar} />
      )}
      {acao?.tipo === "estornar" && (
        <EstornarPedido token={token} pedido={acao.pedido} onFechar={fechar} />
      )}
      {acao?.tipo === "liberar" && (
        <ConfirmarPagamento
          token={token}
          pedido={acao.pedido}
          pagamento={acao.pagamento}
          onFechar={fechar}
        />
      )}
      {acao?.tipo === "resolver" && (
        <ResolverRevisao
          token={token}
          pedido={acao.pedido}
          pagamento={acao.pagamento}
          onFechar={fechar}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Cartão de um pedido
// ---------------------------------------------------------------------
function Selo({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <div className="break-words text-sm text-card-foreground">{children}</div>
    </div>
  );
}

function CartaoPedido({ pedido: p, onAcao }: { pedido: PedidoAdmin; onAcao: (a: Acao) => void }) {
  const acesso = descreverAcesso(p.userId, p.perfil);
  const podeConfirmar =
    p.status === "pendente" || p.status === "cancelado" || p.status === "expirado";

  return (
    <li className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-sm font-semibold text-card-foreground">
          {p.codigo}
        </span>
        <Selo className={COR_STATUS[p.status]}>{STATUS_PEDIDO_LABEL[p.status]}</Selo>
        {p.precisaRevisao && (
          <Selo className="bg-destructive text-destructive-foreground">Precisa de revisão</Selo>
        )}
        {p.teste && <Selo className="bg-info/15 text-info">Teste</Selo>}
        {p.origem === "admin" && (
          <Selo className="bg-secondary text-secondary-foreground">
            Venda registrada pelo admin
          </Selo>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Info rotulo="Plano">
          {p.planoNome}{" "}
          <span className="text-xs text-muted-foreground">
            ({descreverDuracao(p.duracaoQuantidade, p.duracaoUnidade)})
          </span>
        </Info>
        <Info rotulo="Valor">
          <span className="font-semibold">{formatarReais(p.valorTotal)}</span>
        </Info>
        <Info rotulo="Forma escolhida">{nomeMetodo(p.metodo)}</Info>
        <Info rotulo="Pedido em">{dataHora(p.criadoEm)}</Info>
        <Info rotulo="Prazo para pagar">{p.expiraEm ? dataHora(p.expiraEm) : "Sem prazo"}</Info>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Info rotulo="Comprador">
          <p>{p.comprador.nome}</p>
          <p className="text-xs text-muted-foreground">
            {p.comprador.email ?? "sem e-mail"} · {p.comprador.tipo === "cnpj" ? "CNPJ" : "CPF"}{" "}
            {p.comprador.documento}
          </p>
        </Info>
        <Info rotulo="Acesso do aluno">
          <p className={acesso.classe}>Acesso atual: {acesso.texto}</p>
        </Info>
      </div>

      {p.status === "pago" && (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-card-foreground">
          Liberado em {dataHora(p.liberadoEm)} até{" "}
          <strong>{formatarDataBR(p.validadeConcedida)}</strong>
          {p.diasConcedidos !== null ? ` (+${descreverDuracao(p.diasConcedidos, "dias")})` : ""}.
        </p>
      )}
      {(p.status === "cancelado" || p.status === "expirado") && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {p.status === "expirado" ? "Prazo vencido" : "Cancelado"} em {dataHora(p.canceladoEm)}
          {p.motivoCancelamento ? `. Motivo: ${comPonto(p.motivoCancelamento)}` : "."}
        </p>
      )}
      {p.status === "estornado" && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-card-foreground">
          Estornado em {dataHora(p.estornadoEm)}
          {p.motivoEstorno ? `. Motivo: ${comPonto(p.motivoEstorno)}` : "."}{" "}
          {p.acessoRemovido
            ? "O acesso que este pedido liberou foi desfeito (os dias já usados não voltam)."
            : "O acesso do aluno não foi alterado."}
        </p>
      )}

      {p.pagamentos.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Pagamentos deste pedido</p>
          <ul className="mt-1 space-y-1.5">
            {p.pagamentos.map((g) => {
              // Recebido num pedido ainda sem acesso liberado (com ou sem revisão)
              const liberavel = podeLiberarCom(p, g);
              return (
                <li
                  key={g.id}
                  className={cn(
                    "rounded-md px-3 py-2 text-xs",
                    g.requerRevisao
                      ? "border border-destructive/50 bg-destructive/10"
                      : liberavel
                        ? "border border-primary/40 bg-primary/10"
                        : "bg-card/60",
                  )}
                >
                  <p className="text-card-foreground">
                    {nomeMetodo(g.metodo)} · <strong>{formatarReais(g.valor)}</strong> ·{" "}
                    {STATUS_PAGAMENTO_LABEL[g.status] ?? g.status}
                    {g.pagoEm ? ` · pago em ${dataDoMomento(g.pagoEm)}` : ""}
                  </p>
                  {g.observacao && (
                    <p className="mt-0.5 text-muted-foreground">Observação: {g.observacao}</p>
                  )}
                  {(g.requerRevisao || liberavel) && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {g.requerRevisao ? (
                        <p className="flex items-start gap-1.5 font-semibold text-destructive">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                          {g.motivoRevisao ?? "Este pagamento precisa de revisão."}
                        </p>
                      ) : (
                        <p className="text-card-foreground">
                          Pagamento recebido, mas este pedido ainda não liberou o acesso.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {liberavel && (
                          <button
                            type="button"
                            onClick={() => onAcao({ tipo: "liberar", pedido: p, pagamento: g })}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
                          >
                            <CircleCheck className="size-3.5" /> Liberar acesso com este pagamento
                          </button>
                        )}
                        {g.requerRevisao && (
                          <button
                            type="button"
                            onClick={() => onAcao({ tipo: "resolver", pedido: p, pagamento: g })}
                            className="rounded-md border border-destructive/60 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/15"
                          >
                            Marcar como resolvido
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(podeConfirmar || p.status === "pago") && (
        <div className="flex flex-wrap justify-end gap-2">
          {p.status === "pendente" && (
            <button
              type="button"
              onClick={() => onAcao({ tipo: "cancelar", pedido: p })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
            >
              <Ban className="size-3.5" /> Cancelar pedido
            </button>
          )}
          {p.status === "pago" && (
            <button
              type="button"
              onClick={() => onAcao({ tipo: "estornar", pedido: p })}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              <Undo2 className="size-3.5" /> Estornar
            </button>
          )}
          {podeConfirmar && (
            <button
              type="button"
              onClick={() => onAcao({ tipo: "confirmar", pedido: p })}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
            >
              <CircleCheck className="size-3.5" /> Confirmar pagamento
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------
// Peças comuns dos diálogos
// ---------------------------------------------------------------------
function Janela({
  titulo,
  descricao,
  ocupado,
  onFechar,
  children,
}: {
  titulo: ReactNode;
  descricao: ReactNode;
  ocupado: boolean;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        // Não fecha no meio da gravação
        if (!aberto && !ocupado) onFechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Aviso({ tom, children }: { tom: "erro" | "atencao"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs",
        tom === "erro"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/40 bg-primary/10 text-card-foreground",
      )}
    >
      <TriangleAlert
        className={cn("mt-0.5 size-3.5 shrink-0", tom === "atencao" && "text-primary")}
      />
      <span>{children}</span>
    </p>
  );
}

function Rodape({
  ocupado,
  onFechar,
  children,
}: {
  ocupado: boolean;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      <button
        type="button"
        disabled={ocupado}
        onClick={onFechar}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
      >
        Voltar
      </button>
      {children}
    </div>
  );
}

function resumoPedido(p: PedidoAdmin) {
  return `Pedido ${p.codigo} de ${p.comprador.nome}: ${p.planoNome} (${descreverDuracao(
    p.duracaoQuantidade,
    p.duracaoUnidade,
  )}), ${formatarReais(p.valorTotal)}.`;
}

// ---------------------------------------------------------------------
// a) Confirmar pagamento (libera o acesso). Com `pagamento`, libera usando um
//    pagamento já recebido (em revisão ou já revisado), sem gravar outro.
// ---------------------------------------------------------------------
function metodoDoPagamento(g: Pagamento): MetodoPagamento {
  return (METODOS_PAGAMENTO as readonly string[]).includes(g.metodo) ? g.metodo : "outro";
}

/** Dia (AAAA-MM-DD, em São Paulo) em que o pagamento foi recebido; hoje se não houver. */
function diaDoPagamento(pagoEm: string | null | undefined, hoje: string) {
  if (!pagoEm) return hoje;
  const dia = hojeSaoPaulo(new Date(pagoEm));
  return dia >= "2024-01-01" && dia <= hoje ? dia : hoje;
}

function ConfirmarPagamento({
  token,
  pedido: p,
  pagamento: g,
  onFechar,
}: PropsAcao & { pagamento?: Pagamento }) {
  const confirmar = useServerFn(confirmarPagamento);
  const atualizar = useAtualizarPedidos();
  const hoje = hojeSaoPaulo();
  const [metodo, setMetodo] = useState<MetodoPagamento>(p.metodo ?? "pix");
  const [valorTexto, setValorTexto] = useState(centavosParaTexto(p.valorTotal));
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [aceitarDiferente, setAceitarDiferente] = useState(false);

  // Com um pagamento já recebido, forma, valor e data vêm dele e não mudam
  const metodoFinal = g ? metodoDoPagamento(g) : metodo;
  const valorCentavos = g ? g.valor : reaisParaCentavos(valorTexto);
  const dataFinal = g ? diaDoPagamento(g.pagoEm, hoje) : data;

  const valorValido = valorCentavos !== null && valorCentavos > 0;
  // Valor diferente do pedido (maior ou menor) só passa com confirmação e observação
  const diferente = valorCentavos !== null && valorCentavos > 0 && valorCentavos !== p.valorTotal;
  const maior = diferente && (valorCentavos ?? 0) > p.valorTotal;
  const dataValida =
    /^\d{4}-\d{2}-\d{2}$/.test(dataFinal) && dataFinal >= "2024-01-01" && dataFinal <= hoje;
  const dataFutura = /^\d{4}-\d{2}-\d{2}$/.test(data) && data > hoje;
  const obsSuficiente = observacao.trim().length >= 5;
  const pedidoFechado = p.status === "cancelado" || p.status === "expirado";

  const perfil = p.perfil;
  // Pedido que já tem um pagamento recebido (em revisão ou não): a confirmação
  // comum gravaria um segundo pagamento (o banco também recusa)
  const jaRecebido = g ? undefined : p.pagamentos.find((x) => podeLiberarCom(p, x));
  const bloqueio =
    p.userId === null
      ? "A conta do aluno foi excluída. Não há conta para liberar o acesso."
      : !perfil
        ? "Não foi possível ler o acesso atual do aluno. Atualize a lista e tente de novo."
        : perfil.plano === "inativo"
          ? "Conta bloqueada: desbloqueie em Usuários e planos antes de confirmar."
          : jaRecebido
            ? `Este pedido já tem um pagamento recebido (${nomeMetodo(
                jaRecebido.metodo,
              )}, ${formatarReais(jaRecebido.valor)}${
                jaRecebido.pagoEm ? `, pago em ${dataDoMomento(jaRecebido.pagoEm)}` : ""
              }). Use “Liberar acesso com este pagamento” nele, em vez de registrar outro.`
            : null;
  const validadeNova =
    perfil && !bloqueio
      ? novaValidade(
          perfil.plano,
          perfil.planoValidade,
          p.duracaoQuantidade,
          p.duracaoUnidade,
          hoje,
        )
      : null;

  const mut = useMutation({
    mutationFn: () =>
      confirmar({
        data: {
          token,
          pedidoId: p.id,
          pagamentoId: g ? g.id : null,
          metodo: metodoFinal,
          valorCentavos: valorCentavos ?? 0,
          data: dataFinal,
          observacao: observacao.trim(),
          aceitarValorDiferente: diferente && aceitarDiferente,
        },
      }),
    onSuccess: async (r) => {
      const extras: string[] = [];
      const cancelados = r.pedidos_cancelados ?? [];
      if (cancelados.length === 1) {
        extras.push(`O pedido ${cancelados[0]} do aluno, que aguardava pagamento, foi cancelado.`);
      } else if (cancelados.length > 1) {
        extras.push(
          `Os pedidos ${cancelados.join(", ")} do aluno, que aguardavam pagamento, foram cancelados.`,
        );
      }
      if (r.alerta) extras.push(r.alerta);
      const opcoes = extras.length ? { description: extras.join(" "), duration: 12000 } : {};

      if (r.situacao === "revisao") {
        toast.warning(
          "O pagamento foi registrado, mas ficou em revisão: o acesso não foi liberado.",
          opcoes,
        );
      } else if (r.situacao === "ja_registrado") {
        toast.success("Este pagamento já estava registrado. Nada foi alterado.", opcoes);
      } else if (r.validade) {
        toast.success(
          `${g ? "Acesso liberado com o pagamento recebido" : "Pagamento confirmado. Acesso liberado"} até ${formatarDataBR(r.validade)}.`,
          opcoes,
        );
      } else {
        toast.success("Pagamento registrado.", opcoes);
      }
      onFechar();
      await atualizar();
    },
    onError: (e) => {
      toast.error(mensagemErro(e));
      void atualizar();
    },
  });

  const podeEnviar =
    !bloqueio &&
    valorValido &&
    dataValida &&
    (!diferente || (aceitarDiferente && obsSuficiente)) &&
    !mut.isPending;

  return (
    <Janela
      titulo={
        <>
          <CircleCheck className="size-5 text-success" />{" "}
          {g ? "Liberar acesso com este pagamento" : "Confirmar pagamento"}
        </>
      }
      descricao={resumoPedido(p)}
      ocupado={mut.isPending}
      onFechar={onFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (podeEnviar) mut.mutate();
        }}
        className="space-y-3"
      >
        {bloqueio && <Aviso tom="erro">{bloqueio}</Aviso>}
        {pedidoFechado && (
          <Aviso tom="atencao">
            Este pedido estava cancelado ou com prazo vencido;{" "}
            {g ? "liberar o acesso" : "confirmar o pagamento"} reabre o pedido e libera o acesso.
          </Aviso>
        )}
        {pedidoFechado && p.outroPendente && (
          <Aviso tom="atencao">
            O aluno tem o pedido <strong>{p.outroPendente}</strong> aguardando pagamento; ele será
            cancelado. Confira se ele não foi pago também.
          </Aviso>
        )}

        {g ? (
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-card-foreground">
            <p>
              Pagamento recebido: {nomeMetodo(g.metodo)} · <strong>{formatarReais(g.valor)}</strong>
              {g.pagoEm ? ` · pago em ${dataDoMomento(g.pagoEm)}` : ""}
            </p>
            {g.requerRevisao && g.motivoRevisao && (
              <p className="mt-1 text-muted-foreground">Motivo da revisão: {g.motivoRevisao}</p>
            )}
            <p className="mt-2 text-muted-foreground">
              Este pagamento já está gravado no pedido. Liberar o acesso com ele{" "}
              <strong className="text-card-foreground">não cria outro pagamento</strong>: a forma, o
              valor e a data ficam como foram recebidos
              {g.requerRevisao ? ", e o aviso de revisão é marcado como resolvido." : "."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              Forma de pagamento
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
                className={`mt-1 ${inputClass}`}
              >
                {METODOS_PAGAMENTO.map((m) => (
                  <option key={m} value={m}>
                    {METODO_PAGAMENTO_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Valor recebido (R$)
              <input
                inputMode="decimal"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                placeholder="49,90"
                className={`mt-1 ${inputClass}`}
              />
              {!valorValido ? (
                <span className="mt-1 block text-destructive">
                  Valor inválido. Use o formato 49,90.
                </span>
              ) : (
                <span className="mt-1 block">Valor do pedido: {formatarReais(p.valorTotal)}</span>
              )}
            </label>
            <label className="block text-xs text-muted-foreground">
              Data do pagamento
              <input
                type="date"
                required
                value={data}
                min="2024-01-01"
                max={hoje}
                onChange={(e) => setData(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
              {dataFutura && (
                <span className="mt-1 block text-destructive">
                  A data do pagamento não pode ser no futuro.
                </span>
              )}
            </label>
          </div>
        )}

        {diferente && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-xs text-card-foreground">
            <p>
              {`O valor recebido (${formatarReais(valorCentavos)}) é ${
                maior ? "maior" : "menor"
              } que o do pedido (${formatarReais(p.valorTotal)}).`}
              {maior
                ? g
                  ? " Se o aluno pagou a mais, combine com ele a devolução da diferença."
                  : " Confira se não houve erro de digitação."
                : ""}
            </p>
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={aceitarDiferente}
                onChange={(e) => setAceitarDiferente(e.target.checked)}
                className="size-4 accent-primary"
              />
              Confirmo o valor diferente do pedido
            </label>
            {!aceitarDiferente && (
              <p className="mt-1 text-muted-foreground">
                Sem marcar esta opção não é possível {g ? "liberar o acesso" : "confirmar"} com um
                valor diferente do pedido.
              </p>
            )}
          </div>
        )}

        <label className="block text-xs text-muted-foreground">
          Observação {diferente ? "(obrigatória)" : "(opcional)"}
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={
              diferente
                ? maior
                  ? "Ex.: o aluno pagou a mais; diferença devolvida por Pix"
                  : "Ex.: desconto combinado com o aluno; tarifa do banco"
                : g
                  ? "Ex.: pagamento conferido no extrato"
                  : "Ex.: Pix recebido na conta da ABRACAM"
            }
            className={`mt-1 resize-y ${inputClass}`}
          />
          {diferente && aceitarDiferente && !obsSuficiente && (
            <span className="mt-1 block text-destructive">
              Explique na observação por que o valor recebido é diferente do pedido (pelo menos 5
              caracteres).
            </span>
          )}
        </label>

        {perfil && validadeNova && (
          <div className="rounded-md border border-success/30 bg-success/10 p-3 text-xs text-card-foreground">
            <p>
              Acesso atual: <strong>{descreverAcesso(p.userId, perfil).texto}</strong> → Depois de
              confirmar:{" "}
              <strong className="text-success">válido até {formatarDataBR(validadeNova)}</strong>
            </p>
            <p className="mt-1 text-muted-foreground">
              Se o acesso atual ainda estiver valendo, o período do plano começa no dia seguinte ao
              fim dele; senão, começa hoje, que já conta como o 1º dia (a data do pagamento fica só
              no registro).
            </p>
          </div>
        )}

        <Rodape ocupado={mut.isPending} onFechar={onFechar}>
          <button type="submit" disabled={!podeEnviar} className={botaoPrimario}>
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CircleCheck className="size-4" />
            )}
            {g ? "Liberar acesso" : "Confirmar pagamento"}
          </button>
        </Rodape>
      </form>
    </Janela>
  );
}

// ---------------------------------------------------------------------
// b) Cancelar pedido aguardando pagamento
// ---------------------------------------------------------------------
function CancelarPedido({ token, pedido: p, onFechar }: PropsAcao) {
  const cancelar = useServerFn(cancelarPedidoAdmin);
  const atualizar = useAtualizarPedidos();
  const [motivo, setMotivo] = useState("");

  const mut = useMutation({
    mutationFn: () => cancelar({ data: { token, pedidoId: p.id, motivo: motivo.trim() } }),
    onSuccess: async () => {
      toast.success(`Pedido ${p.codigo} cancelado.`);
      onFechar();
      await atualizar();
    },
    onError: (e) => {
      toast.error(mensagemErro(e));
      void atualizar();
    },
  });

  return (
    <Janela
      titulo={
        <>
          <Ban className="size-5 text-destructive" /> Cancelar pedido
        </>
      }
      descricao={resumoPedido(p)}
      ocupado={mut.isPending}
      onFechar={onFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!mut.isPending) mut.mutate();
        }}
        className="space-y-3"
      >
        <Aviso tom="atencao">Se o aluno já pagou, confirme o pagamento em vez de cancelar.</Aviso>
        <label className="block text-xs text-muted-foreground">
          Motivo (opcional — o aluno vê este texto)
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex.: Cancelado a seu pedido."
            className={`mt-1 resize-y ${inputClass}`}
          />
          <span className="mt-1 block">
            Este texto aparece para o aluno na página Planos, então não escreva anotações internas.
            Se ficar em branco, aparece “Cancelado pelo admin.”
          </span>
        </label>
        <Rodape ocupado={mut.isPending} onFechar={onFechar}>
          <button type="submit" disabled={mut.isPending} className={botaoPerigo}>
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Ban className="size-4" />
            )}
            Cancelar pedido
          </button>
        </Rodape>
      </form>
    </Janela>
  );
}

// ---------------------------------------------------------------------
// c) Estornar pedido pago
// ---------------------------------------------------------------------
function EstornarPedido({ token, pedido: p, onFechar }: PropsAcao) {
  const estornar = useServerFn(estornarPedido);
  const atualizar = useAtualizarPedidos();
  const hoje = hojeSaoPaulo();
  const perfil = p.perfil;
  const dias = p.diasConcedidos ?? 0;

  // Dias deste pedido ainda não usados (mesma conta do banco); os já usados não voltam
  const naoUsados = Math.max(
    0,
    p.validadeConcedida
      ? Math.min(dias, diasEntre(somarDias(hoje, -1), p.validadeConcedida))
      : dias,
  );
  // Ninguém mexeu no acesso depois deste pedido: o estorno volta ao que era antes dele
  const restaura =
    p.userId !== null &&
    perfil !== null &&
    perfil.plano === p.planoConcedido &&
    mesmaData(perfil.planoValidade, p.validadeConcedida);
  const validadeAtual =
    perfil && (perfil.plano === "mensal" || perfil.plano === "anual") ? perfil.planoValidade : null;
  // O acesso mudou depois (outra compra ou ajuste): tira só os dias não usados deste pedido
  const tiraDias = !restaura && naoUsados > 0 && validadeAtual !== null;
  const podeRemover = restaura || tiraDias;
  // Período já encerrado: tirar dias agora cortaria o acesso de outra compra
  const periodoEncerrado = p.userId !== null && perfil !== null && !restaura && naoUsados === 0;
  const validadeDepois = tiraDias && validadeAtual ? somarDias(validadeAtual, -naoUsados) : null;

  const anteriorPago = p.planoAnterior === "mensal" || p.planoAnterior === "anual";
  const destino = anteriorPago
    ? `${nomeDoPlano(p.planoAnterior, p.planoNomeAnterior)} até ${formatarDataBR(p.validadeAnterior)}`
    : "sem plano";
  const destinoAtivo = acessoAtivo(p.planoAnterior, p.validadeAnterior);

  const [motivo, setMotivo] = useState("");
  // Marcado por padrão só quando há dias deste pedido para tirar
  const [removerAcesso, setRemoverAcesso] = useState(tiraDias || (restaura && naoUsados > 0));
  const remover = podeRemover && removerAcesso;
  const motivoOk = motivo.trim().length >= 3;

  const mut = useMutation({
    mutationFn: () =>
      estornar({
        data: { token, pedidoId: p.id, removerAcesso: remover, motivo: motivo.trim() },
      }),
    onSuccess: async (r) => {
      if (r.modo === "restaurado") {
        toast.success(
          r.plano === "mensal" || r.plano === "anual"
            ? `Pedido estornado. O acesso voltou ao de antes deste pedido: ${nomeDoPlano(
                r.plano,
                p.planoNomeAnterior,
              )} até ${formatarDataBR(r.validade)}.`
            : "Pedido estornado. O acesso voltou ao de antes deste pedido: o aluno ficou sem plano.",
        );
      } else if (r.modo === "dias") {
        toast.success(
          `Pedido estornado. ${
            r.dias_nao_usados === 1
              ? "Foi tirado 1 dia não usado"
              : `Foram tirados ${r.dias_nao_usados} dias não usados`
          }; o acesso do aluno agora vale até ${formatarDataBR(r.validade)}.`,
        );
      } else {
        toast.success(
          remover
            ? "Pedido estornado. O acesso do aluno não foi alterado: não havia dias deste pedido para tirar."
            : "Pedido estornado. O acesso do aluno não foi alterado.",
        );
      }
      onFechar();
      await atualizar();
    },
    onError: (e) => {
      toast.error(mensagemErro(e));
      void atualizar();
    },
  });

  const podeEnviar = motivoOk && !mut.isPending;

  let previa: ReactNode = null;
  if (p.userId === null) {
    previa = "A conta do aluno foi excluída: não há acesso para tirar.";
  } else if (!perfil) {
    previa = "Não foi possível ler o acesso atual do aluno. Atualize a lista e tente de novo.";
  } else if (!podeRemover) {
    previa = periodoEncerrado
      ? null
      : "O aluno não tem plano mensal ou anual com validade agora, então nenhum dia será tirado.";
  } else if (!remover) {
    previa = "O acesso do aluno continua como está.";
  } else if (restaura) {
    previa = (
      <>
        O acesso volta ao que era antes deste pedido:{" "}
        <strong className="text-destructive">{destino}</strong>.
        {destinoAtivo ? "" : " Com isso, o aluno fica sem plano ativo."}
      </>
    );
  } else if (validadeAtual && validadeDepois) {
    previa = (
      <>
        Validade atual: <strong>{formatarDataBR(validadeAtual)}</strong> →{" "}
        <strong className="text-destructive">{formatarDataBR(validadeDepois)}</strong> (menos{" "}
        {naoUsados === 1 ? "1 dia não usado" : `${naoUsados} dias não usados`} deste pedido).
        {validadeDepois < hoje ? " Com isso, o acesso do aluno fica vencido." : ""}
        {naoUsados < dias
          ? ` Dos ${descreverDuracao(dias, "dias")} liberados por este pedido, ${
              dias - naoUsados === 1
                ? "1 dia já foi usado e não volta"
                : `${dias - naoUsados} dias já foram usados e não voltam`
            }.`
          : ""}
      </>
    );
  }

  return (
    <Janela
      titulo={
        <>
          <Undo2 className="size-5 text-destructive" /> Estornar pedido
        </>
      }
      descricao={resumoPedido(p)}
      ocupado={mut.isPending}
      onFechar={onFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (podeEnviar) mut.mutate();
        }}
        className="space-y-3"
      >
        <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          O estorno aqui só registra a devolução no sistema e, se você marcar a opção abaixo, desfaz
          o acesso que este pedido liberou (só os dias ainda não usados; os já usados não voltam). A
          devolução do dinheiro em si (Pix, transferência, cartão) é feita fora do sistema.
        </p>

        <label className="block text-xs text-muted-foreground">
          Motivo do estorno (obrigatório, uso interno)
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex.: o aluno pediu o dinheiro de volta"
            className={`mt-1 resize-y ${inputClass}`}
          />
          <span className="mt-1 block">
            Fica só no registro da equipe: o aluno não vê este texto, apenas que o pagamento foi
            estornado.
          </span>
          {!motivoOk && motivo.length > 0 && (
            <span className="mt-1 block text-destructive">Informe o motivo do estorno.</span>
          )}
        </label>

        <div className="space-y-2 rounded-md border border-border p-3 text-xs text-card-foreground">
          <label
            className={cn("flex items-center gap-2 font-medium", !podeRemover && "opacity-60")}
          >
            <input
              type="checkbox"
              checked={remover}
              disabled={!podeRemover}
              onChange={(e) => setRemoverAcesso(e.target.checked)}
              className="size-4 accent-primary"
            />
            {restaura
              ? "Desfazer o acesso que este pedido liberou"
              : naoUsados > 0
                ? naoUsados === 1
                  ? "Tirar do aluno o 1 dia ainda não usado deste pedido"
                  : `Tirar do aluno os ${naoUsados} dias ainda não usados deste pedido`
                : "Tirar do aluno os dias deste pedido"}
          </label>
          {periodoEncerrado && (
            <Aviso tom="atencao">
              O período deste pedido já terminou; tirar dias agora reduziria o acesso de outra
              compra. Se precisar, ajuste em Usuários e planos.
            </Aviso>
          )}
          {previa && <p className="text-muted-foreground">{previa}</p>}
        </div>

        <Rodape ocupado={mut.isPending} onFechar={onFechar}>
          <button type="submit" disabled={!podeEnviar} className={botaoPerigo}>
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Undo2 className="size-4" />
            )}
            Estornar
          </button>
        </Rodape>
      </form>
    </Janela>
  );
}

// ---------------------------------------------------------------------
// d) Pagamento que precisa de revisão: marcar como resolvido
// ---------------------------------------------------------------------
function ResolverRevisao({
  token,
  pedido: p,
  pagamento: g,
  onFechar,
}: PropsAcao & { pagamento: Pagamento }) {
  const resolver = useServerFn(resolverRevisao);
  const atualizar = useAtualizarPedidos();
  const [observacao, setObservacao] = useState("");
  const [devolvido, setDevolvido] = useState(false);
  const obsOk = observacao.trim().length >= 3;

  // Recebido num pedido que ainda não liberou acesso: dá para liberar com ele
  const liberavel = podeLiberarCom(p, g);
  // É o pagamento que liberou o pedido (nenhum outro recebido): devolver o valor
  // inteiro é estornar o pedido, não só este pagamento
  const liberouPedido =
    g.status === "pago" &&
    p.status === "pago" &&
    !p.pagamentos.some((x) => x.id !== g.id && x.status === "pago");
  const podeDevolver = g.status === "pago" && !liberouPedido;
  const devolver = podeDevolver && devolvido;

  const mut = useMutation({
    mutationFn: (v: { devolvido: boolean }) =>
      resolver({
        data: {
          token,
          pagamentoId: g.id,
          observacao: observacao.trim(),
          devolvido: v.devolvido,
        },
      }),
    onSuccess: async (r, v) => {
      if (r.devolvido) {
        toast.success(
          "Revisão resolvida. O pagamento passou a constar como estornado e saiu da receita.",
        );
      } else if (v.devolvido) {
        toast.warning(
          "Revisão marcada como resolvida, mas o pagamento já não constava como recebido: nada foi estornado.",
        );
      } else {
        toast.success("Revisão marcada como resolvida.");
      }
      onFechar();
      await atualizar();
    },
    onError: (e) => {
      toast.error(mensagemErro(e));
      void atualizar();
    },
  });

  // Pagamento recebido em pedido sem acesso: só sai da revisão liberando o acesso (outro
  // botão) ou registrando a devolução — o banco recusa marcar como resolvido sem uma das duas.
  const podeEnviar = obsOk && !mut.isPending && (!liberavel || devolver);

  return (
    <Janela
      titulo={
        <>
          <TriangleAlert className="size-5 text-destructive" /> Marcar como resolvido
        </>
      }
      descricao={`Pedido ${p.codigo} de ${p.comprador.nome}.`}
      ocupado={mut.isPending}
      onFechar={onFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (podeEnviar) mut.mutate({ devolvido: devolver });
        }}
        className="space-y-3"
      >
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-card-foreground">
          <p>
            {nomeMetodo(g.metodo)} · <strong>{formatarReais(g.valor)}</strong> ·{" "}
            {STATUS_PAGAMENTO_LABEL[g.status] ?? g.status}
            {g.pagoEm ? ` · pago em ${dataDoMomento(g.pagoEm)}` : ""}
          </p>
          <p className="mt-1 font-semibold text-destructive">
            {g.motivoRevisao ?? "Este pagamento precisa de revisão."}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Marcar como resolvido tira o aviso de revisão. O pedido e o acesso do aluno não mudam.
        </p>
        {liberavel && (
          <Aviso tom="atencao">
            Este pagamento foi recebido e o pedido ainda não liberou o acesso. Se o aluno deve ficar
            com o acesso, feche esta janela e use “Liberar acesso com este pagamento”: o acesso é
            liberado sem gravar outro pagamento. Aqui, só é possível resolver registrando que o
            valor foi devolvido ao aluno.
          </Aviso>
        )}
        {liberouPedido && (
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            Este é o pagamento que liberou o pedido. Se só a diferença foi devolvida ao aluno,
            descreva isso na observação; se o valor inteiro foi devolvido, use “Estornar” no pedido.
          </p>
        )}
        {podeDevolver && (
          <div className="space-y-1 rounded-md border border-border p-3 text-xs text-card-foreground">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={devolvido}
                onChange={(e) => setDevolvido(e.target.checked)}
                className="size-4 accent-primary"
              />
              O valor foi devolvido ao aluno{liberavel ? " (obrigatório para resolver aqui)" : ""}
            </label>
            <p className="text-muted-foreground">
              Marque se o dinheiro já voltou para o aluno: o pagamento passa a constar como
              estornado e sai da receita
              {liberavel ? ", e não poderá mais ser usado para liberar o acesso." : "."} Sem marcar,
              ele continua como recebido e conta na receita. A devolução em si (Pix, transferência,
              cartão) é feita fora do sistema.
            </p>
          </div>
        )}
        <label className="block text-xs text-muted-foreground">
          Como foi resolvido (obrigatório)
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={
              devolver
                ? "Ex.: valor devolvido ao aluno por Pix"
                : "Ex.: conferido no extrato; aluno avisado"
            }
            className={`mt-1 resize-y ${inputClass}`}
          />
          {!obsOk && observacao.length > 0 && (
            <span className="mt-1 block text-destructive">
              Descreva como foi resolvido (ex.: valor devolvido ao aluno por Pix).
            </span>
          )}
        </label>
        <Rodape ocupado={mut.isPending} onFechar={onFechar}>
          <button type="submit" disabled={!podeEnviar} className={botaoPrimario}>
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CircleCheck className="size-4" />
            )}
            Marcar como resolvido
          </button>
        </Rodape>
      </form>
    </Janela>
  );
}
