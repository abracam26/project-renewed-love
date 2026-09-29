import { useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarCheck,
  Check,
  Clock,
  Loader2,
  Mail,
  ReceiptText,
  ShoppingCart,
  Sparkle,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import { CONTROLADOR } from "@/lib/juridico";
import {
  METODO_PAGAMENTO_LABEL,
  STATUS_PEDIDO_LABEL,
  descreverDuracao,
  formatarReais,
  periodoDoPlano,
  type FormaManual,
  type StatusPedido,
} from "@/lib/pagamentos";
import { cancelarMeuPedido, criarPedido, planosParaAluno } from "@/lib/pagamentos.functions";
import { formatarDataBR, nomeDoPlano, novaValidade } from "@/lib/planos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Planos — Simulador ABT" },
      {
        name: "description",
        content:
          "Escolha um plano do Simulador ABT, faça o pedido e veja como pagar. O acesso é liberado assim que a ABRACAM confirmar o pagamento.",
      },
    ],
  }),
  component: Planos,
});

type DadosPlanos = Awaited<ReturnType<typeof planosParaAluno>>;
type PlanoVenda = DadosPlanos["planos"][number];
type Pedido = DadosPlanos["pedidos"][number];
type FormaAluno = DadosPlanos["formas"][number];

/** Âncora da seção "Meus pedidos" (a página rola até ela depois de um pedido). */
const ID_PEDIDOS = "meus-pedidos";

// Conteúdo fixo do cartão do teste grátis
const TESTE_GRATIS = {
  nome: "Teste grátis",
  preco: "R$ 0",
  periodo: "uma vez por CPF",
  descricao: "Para conhecer o simulador antes de contratar.",
  beneficios: [
    "1 simulado de 10 questões, da prova que você escolher: ABT1, ABT2 ou ABT – Correspondentes",
    "30 minutos para responder",
    "Resultado com as questões certas e erradas",
  ],
};

const COR_STATUS: Record<StatusPedido, string> = {
  pendente: "bg-primary/15 text-primary",
  pago: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
  estornado: "bg-destructive/15 text-destructive",
};

const botaoSecundario =
  "rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50";

function contato(assunto: string) {
  return `mailto:${CONTROLADOR.emailContato}?subject=${encodeURIComponent(assunto)}`;
}

function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function rolarAtePedidos() {
  document.getElementById(ID_PEDIDOS)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Por quantos dias um pedido vencido ou cancelado ainda gera o aviso "se já pagou, não faça outro". */
const DIAS_AVISO_ENCERRADO = 7;

/** Pedido vencido ou cancelado há poucos dias: quem já pagou não deve fazer outro. */
function encerradoRecente(p: Pedido) {
  if (p.status !== "expirado" && p.status !== "cancelado") return false;
  if (!p.canceladoEm) return false;
  return Date.now() - Date.parse(p.canceladoEm) <= DIAS_AVISO_ENCERRADO * 24 * 60 * 60 * 1000;
}

/**
 * Pendente com o prazo já vencido no relógio local passa a valer como vencido (o banco o marca
 * na próxima leitura). Assim a tela não promete manter um pedido que o banco dará por vencido.
 */
function normalizarVencidos(lista: Pedido[]): Pedido[] {
  const agora = Date.now();
  return lista.map((p) =>
    p.status === "pendente" && p.expiraEm && Date.parse(p.expiraEm) <= agora
      ? { ...p, status: "expirado" as const, canceladoEm: p.expiraEm }
      : p,
  );
}

/**
 * Pedido encerrado depois do qual outro pedido foi pago (liberado): os avisos "se já pagou, não
 * faça outro pedido" não valem mais para ele. Cobre também o cancelado com o motivo
 * "Pagamento confirmado no pedido ...".
 */
function superadoEm(lista: Pedido[], p: Pedido) {
  const criado = Date.parse(p.criadoEm);
  return lista.some(
    (q) =>
      q.id !== p.id &&
      (q.status === "pago" || q.status === "estornado") &&
      q.liberadoEm != null &&
      Date.parse(q.liberadoEm) >= criado,
  );
}

/** Link de e-mail para a ABRACAM já com o código do pedido no assunto. */
function EmailPedido({ codigo }: { codigo: string }) {
  return (
    <a href={contato(`Pedido ${codigo}`)} className="font-medium text-primary hover:underline">
      {CONTROLADOR.emailContato}
    </a>
  );
}

/** Texto para quem pode já ter pago um pedido que venceu ou foi cancelado. */
function TextoJaPagou({
  pedido: p,
  bloqueado,
  superado = false,
}: {
  pedido: Pedido;
  bloqueado: boolean;
  /** Outro pedido foi pago depois deste: sem "não faça outro pedido", só o caminho da devolução */
  superado?: boolean;
}) {
  const codigo = <span className="font-mono">{p.codigo}</span>;
  if (superado) {
    return (
      <>
        Se você também pagou este pedido, fale com a ABRACAM (<EmailPedido codigo={p.codigo} />)
        informando o código {codigo}.
      </>
    );
  }
  if (bloqueado) {
    return (
      <>
        Se você já pagou este pedido, fale com a ABRACAM (<EmailPedido codigo={p.codigo} />)
        informando o código {codigo}.
      </>
    );
  }
  if (p.status === "expirado") {
    return (
      <>
        Se você pagou {p.expiraEm ? `até ${dataHora(p.expiraEm)}` : "dentro do prazo"}, não faça
        outro pedido: o pagamento ainda será confirmado. Em dúvida, fale com a ABRACAM (
        <EmailPedido codigo={p.codigo} />) informando o código {codigo}.
      </>
    );
  }
  return (
    <>
      Se você já pagou este pedido, não faça outro: fale com a ABRACAM (
      <EmailPedido codigo={p.codigo} />) informando o código {codigo}.
    </>
  );
}

/** Caminho para desistir da compra (art. 49 do CDC), igual ao dos Termos de Uso. */
function TextoDesistencia({ codigo }: { codigo?: string }) {
  return codigo ? (
    <>
      Você pode desistir em até 7 dias a contar da contratação e receber o valor pago de volta:
      escreva para <EmailPedido codigo={codigo} /> informando o código{" "}
      <span className="font-mono">{codigo}</span>.
    </>
  ) : (
    <>
      Você pode desistir em até 7 dias a contar da contratação e receber o valor pago de volta:
      escreva para {CONTROLADOR.emailContato} informando o código do pedido. Veja os{" "}
      <Link
        to="/termos"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        Termos de Uso
      </Link>
      .
    </>
  );
}

function Planos() {
  const { token, loading } = useToken();
  const carregar = useServerFn(planosParaAluno);
  const query = useQuery({
    queryKey: ["planos-aluno", token],
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });
  // Guarda só o id: o plano mostrado no diálogo vem sempre dos dados mais recentes
  const [escolhidoId, setEscolhidoId] = useState<string | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  // Depois de um pedido, a página rola até "Meus pedidos" quando o diálogo termina de fechar
  const rolarDepoisDeFechar = useRef(false);

  if (loading || !token || query.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Carregando planos...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="panel p-6 text-center text-sm text-destructive">
        {mensagemErro(query.error)}
      </div>
    );
  }

  const dados = query.data;
  const { atual, planos, formas } = dados;
  // Pendente com prazo vencido no relógio local já aparece como vencido em toda a página
  const pedidos = normalizarVencidos(dados.pedidos);
  const pendente = pedidos.find((p) => p.status === "pendente");
  const superado = (p: Pedido) => superadoEm(pedidos, p);
  // Conta bloqueada: o pagamento não seria confirmado, então a página não convida a pagar
  const bloqueado = atual.bloqueado && !atual.isAdmin;
  const vencidoRecente =
    !pendente && !bloqueado
      ? pedidos.find((p) => p.status === "expirado" && encerradoRecente(p) && !superado(p))
      : undefined;
  const escolhido = escolhidoId ? planos.find((p) => p.id === escolhidoId) : undefined;

  // "Seu plano" em no máximo um cartão: com o nome do plano comprado, só o de nome igual;
  // sem nome (plano definido pelo admin ou compra antiga), só se não houver dúvida
  const candidatos = atual.acessoAtivo ? planos.filter((p) => p.tipoAcesso === atual.plano) : [];
  const seuPlanoId = atual.planoNome
    ? candidatos.find((p) => p.nome === atual.planoNome)?.id
    : candidatos.length === 1
      ? candidatos[0]?.id
      : undefined;
  const ehSeuPlano = (p: PlanoVenda) => p.id === seuPlanoId;

  const motivoBloqueio = atual.bloqueado
    ? "Sua conta está bloqueada. Fale com a ABRACAM."
    : !atual.cadastroCompleto
      ? "Complete seu cadastro para contratar."
      : formas.length === 0
        ? `No momento não há forma de pagamento disponível. Fale com a ABRACAM (${CONTROLADOR.emailContato}).`
        : null;

  function abrirContratacao(p: PlanoVenda) {
    setEscolhidoId(p.id);
    setDialogoAberto(true);
    // O diálogo diz o que acontece com o pedido aguardando pagamento: confere antes com o banco
    void query.refetch();
  }

  function irParaPedidos() {
    rolarDepoisDeFechar.current = true;
    setDialogoAberto(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Planos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um plano, faça o pedido e siga as instruções de pagamento. O acesso é liberado
          assim que a ABRACAM confirmar o pagamento.
        </p>
      </div>

      <div
        className={cn(
          "panel p-4 text-sm text-card-foreground",
          atual.acessoAtivo
            ? "border-success/40"
            : bloqueado
              ? "border-destructive/40"
              : "border-border",
        )}
      >
        {atual.acessoAtivo ? (
          <>
            Seu plano <strong>{nomeDoPlano(atual.plano, atual.planoNome)}</strong> está ativo até{" "}
            <strong>{formatarDataBR(atual.planoValidade)}</strong>.
          </>
        ) : atual.isAdmin ? (
          <>
            Conta de administrador: todos os simulados liberados. Pedidos feitos com esta conta
            ficam marcados como teste.
          </>
        ) : atual.bloqueado ? (
          <>Sua conta está bloqueada. Fale com a ABRACAM ({CONTROLADOR.emailContato}).</>
        ) : (
          <>
            Você não tem plano ativo.{" "}
            {atual.gratuidadeUsada
              ? "Seu teste grátis já foi utilizado."
              : "Seu teste grátis ainda está disponível no painel."}
          </>
        )}
      </div>

      {pendente &&
        (bloqueado ? (
          <div className="panel flex flex-wrap items-center justify-between gap-3 border-destructive/40 p-4 text-sm text-card-foreground">
            <p>
              Sua conta está bloqueada: não pague o pedido{" "}
              <span className="font-mono font-semibold">{pendente.codigo}</span>. Se já pagou, fale
              com a ABRACAM informando o código.
            </p>
            <button type="button" onClick={rolarAtePedidos} className={botaoSecundario}>
              Ver pedido
            </button>
          </div>
        ) : (
          <div className="panel flex flex-wrap items-center justify-between gap-3 border-primary/40 p-4 text-sm text-card-foreground">
            <p>
              Você tem o pedido <span className="font-mono font-semibold">{pendente.codigo}</span>{" "}
              aguardando pagamento.
            </p>
            <button type="button" onClick={rolarAtePedidos} className={botaoSecundario}>
              Ver como pagar
            </button>
          </div>
        ))}

      {vencidoRecente && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 border-primary/40 p-4 text-sm text-card-foreground">
          <p>
            O prazo do pedido{" "}
            <span className="font-mono font-semibold">{vencidoRecente.codigo}</span> venceu. Se você
            pagou dentro do prazo, não faça outro pedido: o pagamento ainda será confirmado.
          </p>
          <button type="button" onClick={rolarAtePedidos} className={botaoSecundario}>
            Ver pedido
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CartaoTesteGratis
          seuPlano={!atual.acessoAtivo && !atual.isAdmin && !atual.bloqueado}
          usado={atual.gratuidadeUsada}
        />
        {planos.length === 0 ? (
          <CartaoEmBreve />
        ) : (
          planos.map((p) => (
            <CartaoPlano
              key={p.id}
              plano={p}
              seuPlano={ehSeuPlano(p)}
              renovar={atual.acessoAtivo}
              motivoBloqueio={motivoBloqueio}
              onContratar={() => abrirContratacao(p)}
            />
          ))
        )}
      </div>

      {pedidos.length > 0 && (
        <section id={ID_PEDIDOS} className="scroll-mt-20 space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ReceiptText className="size-5 text-primary" /> Meus pedidos
          </h2>
          <ul className="space-y-3">
            {pedidos.map((p) => (
              <CartaoPedido
                key={p.id}
                token={token}
                pedido={p}
                formas={formas}
                bloqueado={bloqueado}
                superado={superado(p)}
              />
            ))}
          </ul>
        </section>
      )}

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-lg"
          onCloseAutoFocus={(e) => {
            if (!rolarDepoisDeFechar.current) return;
            rolarDepoisDeFechar.current = false;
            e.preventDefault();
            rolarAtePedidos();
          }}
        >
          {escolhidoId &&
            (escolhido ? (
              <FormContratar
                key={escolhido.id}
                token={token}
                plano={escolhido}
                dados={dados}
                pedidos={pedidos}
                atualizando={query.isFetching}
                onVoltar={() => setDialogoAberto(false)}
                onIrParaPedidos={irParaPedidos}
              />
            ) : (
              <PlanoIndisponivel onVoltar={() => setDialogoAberto(false)} />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeloSeuPlano() {
  return (
    <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
      Seu plano
    </span>
  );
}

function ListaBeneficios({ itens }: { itens: readonly string[] }) {
  return (
    <ul className="mt-5 flex-1 space-y-2">
      {itens.map((b) => (
        <li key={b} className="flex items-start gap-2 text-sm text-card-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
          {b}
        </li>
      ))}
    </ul>
  );
}

function CartaoTesteGratis({ seuPlano, usado }: { seuPlano: boolean; usado: boolean }) {
  return (
    <div className="panel flex flex-col p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-card-foreground">{TESTE_GRATIS.nome}</h2>
        {seuPlano && <SeloSeuPlano />}
      </div>
      <p className="mt-4 text-2xl font-bold text-card-foreground">{TESTE_GRATIS.preco}</p>
      <p className="text-xs text-muted-foreground">{TESTE_GRATIS.periodo}</p>
      <p className="mt-2 text-xs text-muted-foreground">{TESTE_GRATIS.descricao}</p>
      <ListaBeneficios itens={TESTE_GRATIS.beneficios} />
      <p className="mt-6 rounded-md bg-muted/40 px-4 py-2.5 text-center text-xs text-muted-foreground">
        {usado ? "Teste grátis já utilizado" : "Disponível no painel"}
      </p>
    </div>
  );
}

function CartaoPlano({
  plano: p,
  seuPlano,
  renovar,
  motivoBloqueio,
  onContratar,
}: {
  plano: PlanoVenda;
  seuPlano: boolean;
  renovar: boolean;
  motivoBloqueio: string | null;
  onContratar: () => void;
}) {
  return (
    <div className={cn("panel flex flex-col p-6", p.destaque && "border-primary shadow-gold")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-card-foreground">{p.nome}</h2>
        <div className="flex flex-wrap gap-1.5">
          {seuPlano && <SeloSeuPlano />}
          {p.destaque && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkle className="size-3" /> Mais escolhido
            </span>
          )}
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold text-card-foreground">
        {formatarReais(p.precoCentavos)}
      </p>
      <p className="text-xs text-muted-foreground">
        {periodoDoPlano(p.duracaoQuantidade, p.duracaoUnidade)}
      </p>
      {p.descricao && <p className="mt-2 text-xs text-muted-foreground">{p.descricao}</p>}

      <ListaBeneficios itens={p.beneficios} />

      <div className="mt-6">
        <button
          type="button"
          disabled={Boolean(motivoBloqueio)}
          onClick={onContratar}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            p.destaque
              ? "bg-primary text-primary-foreground shadow-gold hover:bg-primary/90"
              : "border border-border text-card-foreground hover:bg-accent",
          )}
        >
          <ShoppingCart className="size-4" />
          {renovar ? "Renovar" : "Contratar"}
        </button>
        {motivoBloqueio && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{motivoBloqueio}</p>
        )}
      </div>
    </div>
  );
}

function CartaoEmBreve() {
  return (
    <div className="panel flex flex-col p-6 lg:col-span-2">
      <h2 className="text-lg font-semibold text-card-foreground">Contratação online em breve</h2>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">
        Os planos pagos ainda não podem ser contratados por esta página. Enquanto isso, fale com a
        ABRACAM por e-mail para contratar ou renovar o seu acesso.
      </p>
      <a
        href={contato("Contratar plano — Simulador ABT")}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90"
      >
        <Mail className="size-4" />
        Falar com a ABRACAM
      </a>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {CONTROLADOR.emailContato}
      </p>
    </div>
  );
}

function Opcao({
  nome,
  marcado,
  onEscolher,
  children,
}: {
  nome: string;
  marcado: boolean;
  onEscolher: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm text-card-foreground transition-colors",
        marcado ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40",
      )}
    >
      <input
        type="radio"
        name={nome}
        checked={marcado}
        onChange={onEscolher}
        className="mt-1 accent-primary"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function PlanoIndisponivel({ onVoltar }: { onVoltar: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Plano indisponível</DialogTitle>
        <DialogDescription>
          Este plano não está mais disponível. Veja os planos disponíveis nesta página.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
        >
          Voltar
        </button>
      </div>
    </>
  );
}

/** O que vai ao servidor: a escolha do aluno e o que a tela mostrou sobre o pedido pendente. */
type EnvioPedido = {
  metodo: FormaManual;
  comprador: "cpf" | "cnpj";
  pendenteEsperado: string | null;
  manterEsperado: boolean;
};

function FormContratar({
  token,
  plano,
  dados,
  pedidos,
  atualizando,
  onVoltar,
  onIrParaPedidos,
}: {
  token: string;
  plano: PlanoVenda;
  dados: DadosPlanos;
  /** Pedidos com o vencimento já conferido no relógio local (normalizarVencidos) */
  pedidos: Pedido[];
  /** Os dados estão sendo recarregados: o pedido espera a situação atual */
  atualizando: boolean;
  onVoltar: () => void;
  /** Fecha o diálogo e rola até "Meus pedidos" */
  onIrParaPedidos: () => void;
}) {
  const { atual, comprador: docs, formas, prazoDias } = dados;
  const criar = useServerFn(criarPedido);
  const queryClient = useQueryClient();
  const [comprador, setComprador] = useState<"cpf" | "cnpj">("cpf");
  const [metodo, setMetodo] = useState<FormaManual | null>(
    formas.length === 1 ? (formas[0]?.metodo ?? null) : null,
  );
  // Depois de recarregar, a escolha pode não existir mais (forma desligada, CNPJ removido do
  // cadastro): a tela e o pedido usam só o que vale nos dados atuais
  const metodoValido: FormaManual | null =
    metodo && formas.some((f) => f.metodo === metodo)
      ? metodo
      : formas.length === 1
        ? (formas[0]?.metodo ?? null)
        : null;
  const compradorValido: "cpf" | "cnpj" = comprador === "cnpj" && !docs.cnpj ? "cpf" : comprador;
  // Impedimentos que podem ter chegado no recarregamento (mesma regra dos cartões)
  const barrado =
    atual.bloqueado && !atual.isAdmin
      ? "Sua conta está bloqueada. Fale com a ABRACAM."
      : !atual.cadastroCompleto
        ? "Complete seu cadastro para contratar."
        : formas.length === 0
          ? `No momento não há forma de pagamento disponível. Fale com a ABRACAM (${CONTROLADOR.emailContato}).`
          : null;

  const validade = novaValidade(
    atual.plano,
    atual.planoValidade,
    plano.duracaoQuantidade,
    plano.duracaoUnidade,
  );

  // Só pode haver um pedido aguardando pagamento. Mesma regra do banco (criar_pedido): ele é
  // mantido se o plano, o preço, o tipo de acesso, a duração e o comprador forem os mesmos;
  // senão, é substituído pelo novo.
  const pendente = pedidos.find((p) => p.status === "pendente");
  const mantido =
    pendente &&
    pendente.planoId === plano.id &&
    pendente.valorTotal === plano.precoCentavos &&
    pendente.planoTipoAcesso === plano.tipoAcesso &&
    pendente.duracaoQuantidade === plano.duracaoQuantidade &&
    pendente.duracaoUnidade === plano.duracaoUnidade &&
    pendente.compradorTipo === compradorValido &&
    pendente.documentoConfere
      ? pendente
      : undefined;
  // Sem pendente: um pedido que venceu ou foi cancelado há pouco pode já ter sido pago (a não ser
  // que outro pedido tenha sido pago depois dele)
  const recente = pendente
    ? undefined
    : pedidos.find((p) => encerradoRecente(p) && !superadoEm(pedidos, p));
  // O banco confere se a situação ainda é a que a tela mostrou. Vai o código do pendente como veio
  // do servidor, mesmo que já vencido no relógio local (diferença de relógio não gera recusa)
  const pendenteEsperado = dados.pedidos.find((p) => p.status === "pendente")?.codigo ?? null;

  // O pedido mantido conserva o prazo que já tinha
  const prazo = mantido
    ? mantido.expiraEm
      ? `Pague até ${dataHora(mantido.expiraEm)} (prazo do pedido existente).`
      : null
    : prazoDias > 0
      ? `Você terá ${descreverDuracao(prazoDias, "dias")} para pagar.`
      : null;

  const mut = useMutation({
    mutationFn: (v: EnvioPedido) =>
      criar({
        data: {
          token,
          planoId: plano.id,
          metodo: v.metodo,
          comprador: v.comprador,
          pendenteEsperado: v.pendenteEsperado,
          manterEsperado: v.manterEsperado,
        },
      }),
    onSuccess: async (r, v) => {
      if (v.manterEsperado && !r.reaproveitado) {
        // A tela disse que o pedido seria mantido, mas o banco criou outro
        toast.warning(`Foi criado um novo pedido, ${r.codigo}.`, {
          description: `Se você já pagou o pedido anterior${
            v.pendenteEsperado ? ` (${v.pendenteEsperado})` : ""
          }, não pague este: fale com a ABRACAM (${CONTROLADOR.emailContato}).`,
        });
      } else {
        toast.success(
          r.reaproveitado
            ? `Você já tinha um pedido deste plano aguardando pagamento: ${r.codigo}`
            : `Pedido ${r.codigo} criado`,
          { description: "Veja em Meus pedidos como fazer o pagamento." },
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["planos-aluno"] });
      onIrParaPedidos();
    },
    // O erro pode vir de uma mudança feita por fora (plano desativado, pedido pago ou vencido):
    // recarrega para a tela mostrar a situação real
    onError: async (e) => {
      const msg = mensagemErro(e);
      // Recusa do banco: os pedidos não são mais os que a tela mostrava
      const mudou = msg.startsWith("Seus pedidos mudaram");
      if (mudou) toast.warning(msg);
      else toast.error(msg);
      await queryClient.invalidateQueries({ queryKey: ["planos-aluno"] });
      // A mensagem manda conferir "Meus pedidos": fecha o diálogo e rola até lá
      if (mudou) onIrParaPedidos();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {atual.acessoAtivo ? "Renovar" : "Contratar"}: {plano.nome}
        </DialogTitle>
        <DialogDescription>
          Confira os dados e faça o pedido. Você paga por fora (Pix, transferência etc.) e o acesso
          é liberado assim que a ABRACAM confirmar o pagamento.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-border bg-secondary/40 p-3 text-card-foreground">
          <p className="font-semibold">{plano.nome}</p>
          <p>
            <strong>{formatarReais(plano.precoCentavos)}</strong> · acesso por{" "}
            {descreverDuracao(plano.duracaoQuantidade, plano.duracaoUnidade)}
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-xs">
            <CalendarCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            <span>
              {atual.acessoAtivo ? (
                <>
                  Com o pagamento confirmado hoje, soma ao seu acesso atual: vai até{" "}
                  <strong>{formatarDataBR(validade)}</strong>.
                </>
              ) : (
                <>
                  Com o pagamento confirmado hoje, o acesso vale até{" "}
                  <strong>{formatarDataBR(validade)}</strong>. A contagem começa no dia em que a
                  ABRACAM confirmar o pagamento.
                </>
              )}
            </span>
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">
            Comprar em nome de
          </legend>
          <Opcao
            nome="comprador"
            marcado={compradorValido === "cpf"}
            onEscolher={() => setComprador("cpf")}
          >
            Pessoa física — CPF <span className="font-mono">{docs.cpf}</span>
          </Opcao>
          {docs.cnpj && (
            <Opcao
              nome="comprador"
              marcado={compradorValido === "cnpj"}
              onEscolher={() => setComprador("cnpj")}
            >
              Empresa — CNPJ <span className="font-mono">{docs.cnpj}</span>
              {docs.empresa ? ` (${docs.empresa})` : ""}
            </Opcao>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">
            Forma de pagamento
          </legend>
          {formas.map((f) => (
            <Opcao
              key={f.metodo}
              nome="forma"
              marcado={metodoValido === f.metodo}
              onEscolher={() => setMetodo(f.metodo)}
            >
              {f.rotulo}
            </Opcao>
          ))}
          <p className="text-xs text-muted-foreground">
            {prazo && (
              <>
                {prazo} Depois disso, o pedido vence. Um pagamento feito dentro do prazo continua
                valendo: não faça outro pedido, aguarde a confirmação ou fale com a ABRACAM.{" "}
              </>
            )}
            As instruções de pagamento aparecem em Meus pedidos, nesta página, logo depois do
            pedido.
          </p>
        </fieldset>

        {recente && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-card-foreground">
            Seu pedido <span className="font-mono">{recente.codigo}</span> ({recente.planoNome}){" "}
            {recente.status === "expirado"
              ? "venceu"
              : `foi cancelado em ${dataHora(recente.canceladoEm)}`}
            . <TextoJaPagou pedido={recente} bloqueado={false} />
          </p>
        )}

        {pendente &&
          (mantido ? (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-card-foreground">
              Você já tem um pedido deste plano aguardando pagamento (
              <span className="font-mono">{pendente.codigo}</span>). Ele será mantido; se escolher
              outra forma de pagamento, ela é atualizada no pedido.
            </p>
          ) : (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-card-foreground">
              Você tem o pedido <span className="font-mono">{pendente.codigo}</span> (
              {pendente.planoNome}) aguardando pagamento. Ao fazer este novo pedido, ele será
              cancelado. Se você já pagou o pedido{" "}
              <span className="font-mono">{pendente.codigo}</span>, não faça outro: fale com a
              ABRACAM ({CONTROLADOR.emailContato}) informando o código.
            </p>
          ))}

        {atual.isAdmin && (
          <p className="text-xs text-muted-foreground">
            Conta de administrador: este pedido fica marcado como teste.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          <TextoDesistencia />
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onVoltar}
          disabled={mut.isPending}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          disabled={Boolean(barrado) || !metodoValido || mut.isPending || atualizando}
          onClick={() =>
            !barrado &&
            metodoValido &&
            !atualizando &&
            mut.mutate({
              metodo: metodoValido,
              comprador: compradorValido,
              pendenteEsperado,
              manterEsperado: Boolean(mantido),
            })
          }
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending || atualizando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShoppingCart className="size-4" />
          )}
          Fazer pedido
        </button>
      </div>
      {barrado ? (
        <p className="-mt-2 text-right text-[11px] font-medium text-destructive">{barrado}</p>
      ) : !metodoValido ? (
        <p className="-mt-2 text-right text-[11px] text-muted-foreground">
          Escolha a forma de pagamento para continuar.
        </p>
      ) : (
        atualizando &&
        !mut.isPending && (
          <p className="-mt-2 text-right text-[11px] text-muted-foreground">
            Conferindo seus pedidos...
          </p>
        )
      )}
    </>
  );
}

function CartaoPedido({
  token,
  pedido: p,
  formas,
  bloqueado,
  superado,
}: {
  token: string;
  pedido: Pedido;
  formas: FormaAluno[];
  /** Conta bloqueada (e não admin): o pagamento não seria confirmado */
  bloqueado: boolean;
  /** Outro pedido foi pago depois deste (superadoEm): sem os avisos "não faça outro pedido" */
  superado: boolean;
}) {
  const cancelar = useServerFn(cancelarMeuPedido);
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  const mut = useMutation({
    mutationFn: () => cancelar({ data: { token, pedidoId: p.id } }),
    onSuccess: async () => {
      toast.success(`Pedido ${p.codigo} cancelado.`);
      setConfirmando(false);
      await queryClient.invalidateQueries({ queryKey: ["planos-aluno"] });
    },
    // O pedido pode ter sido pago ou vencido enquanto a página estava aberta: recarrega
    onError: async (e) => {
      toast.error(mensagemErro(e));
      setConfirmando(false);
      await queryClient.invalidateQueries({ queryKey: ["planos-aluno"] });
    },
  });

  const instrucoes = p.metodo ? formas.find((f) => f.metodo === p.metodo)?.instrucoes.trim() : "";

  return (
    <li className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-card-foreground">{p.codigo}</p>
          <p className="text-sm text-card-foreground">
            {p.planoNome} · {formatarReais(p.valorTotal)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Pedido feito em {dataHora(p.criadoEm)}
            {p.metodo ? ` · ${METODO_PAGAMENTO_LABEL[p.metodo]}` : ""}
          </p>
        </div>
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", COR_STATUS[p.status])}>
          {STATUS_PEDIDO_LABEL[p.status]}
        </span>
      </div>

      {p.status === "pendente" && (
        <>
          {bloqueado ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-card-foreground">
              Sua conta está bloqueada: não pague este pedido. Se já pagou, fale com a ABRACAM (
              <EmailPedido codigo={p.codigo} />) informando o código{" "}
              <span className="font-mono">{p.codigo}</span>.
            </p>
          ) : (
            <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-card-foreground">
              <p className="flex items-center gap-1.5 font-semibold">
                <Wallet className="size-4 text-primary" /> Como pagar
              </p>
              <p className="mt-1 text-xs">
                Forma escolhida:{" "}
                <strong>{p.metodo ? METODO_PAGAMENTO_LABEL[p.metodo] : "—"}</strong> · Valor:{" "}
                <strong>{formatarReais(p.valorTotal)}</strong>
              </p>
              <p className="mt-2 whitespace-pre-line">
                {instrucoes ||
                  `Fale com a ABRACAM pelo e-mail ${CONTROLADOR.emailContato} informando o código do pedido ${p.codigo}.`}
              </p>
              {p.expiraEm && (
                <p className="mt-2 flex items-start gap-1.5 text-xs">
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>
                    Pague até {dataHora(p.expiraEm)}. Depois disso, o pedido vence. Um pagamento
                    feito dentro do prazo continua valendo: não faça outro pedido, aguarde a
                    confirmação ou fale com a ABRACAM.
                  </span>
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Assim que a ABRACAM confirmar o pagamento, o acesso é liberado na sua conta.
              </p>
            </div>
          )}

          {confirmando ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-card-foreground">
              <p className="font-semibold">Cancelar o pedido {p.codigo}?</p>
              <p className="mt-1">
                Se você já pagou, não cancele: fale com a ABRACAM informando o código{" "}
                <span className="font-mono">{p.codigo}</span>.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={mut.isPending}
                  onClick={() => setConfirmando(false)}
                  className={botaoSecundario}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                >
                  {mut.isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Sim, cancelar pedido
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className={botaoSecundario}
              >
                Cancelar pedido
              </button>
            </div>
          )}
        </>
      )}

      {p.status === "pago" && (
        <>
          <p className="rounded-md border border-success/30 bg-success/10 p-3 text-xs text-card-foreground">
            {p.validadeConcedida ? (
              <>
                Pagamento confirmado. Acesso liberado até{" "}
                <strong>{formatarDataBR(p.validadeConcedida)}</strong>.
              </>
            ) : (
              "Pagamento confirmado."
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            <TextoDesistencia codigo={p.codigo} />
          </p>
        </>
      )}

      {(p.status === "cancelado" || p.status === "expirado") && (
        <>
          {p.motivoCancelamento && (
            <p className="text-xs text-muted-foreground">{p.motivoCancelamento}</p>
          )}
          {/* Quem pagou e viu o pedido vencer ou ser cancelado não deve pagar de novo; se outro
              pedido já foi pago depois dele, fica só o caminho para pedir a devolução */}
          <p
            className={cn(
              "text-xs",
              encerradoRecente(p) && !superado
                ? "rounded-md border border-primary/40 bg-primary/10 p-3 text-card-foreground"
                : "text-muted-foreground",
            )}
          >
            <TextoJaPagou pedido={p} bloqueado={bloqueado} superado={superado} />
          </p>
        </>
      )}

      {p.status === "estornado" && (
        <p className="text-xs text-muted-foreground">Pagamento estornado.</p>
      )}
    </li>
  );
}
