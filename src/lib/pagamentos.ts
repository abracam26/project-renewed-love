/**
 * Planos à venda, pedidos e pagamentos: constantes e utilitários usados no
 * servidor e nas telas. Valores em dinheiro sempre em centavos (inteiro),
 * como na API do Pagar.me.
 */

/**
 * Categoria de acesso que o plano libera. Mensal e anual são por tempo
 * (gravados em profiles.plano); o pacote soma simulados ao saldo do aluno.
 */
export const TIPOS_ACESSO = ["mensal", "anual", "pacote"] as const;
export type TipoAcesso = (typeof TIPOS_ACESSO)[number];
export const TIPO_ACESSO_LABEL: Record<TipoAcesso, string> = {
  mensal: "Mensal",
  anual: "Anual",
  pacote: "Pacote de simulados",
};

/** Maior pacote que dá para cadastrar (mesmo limite do banco). */
export const MAX_SIMULADOS_PACOTE = 500;

export const UNIDADES_DURACAO = ["meses", "dias"] as const;
export type UnidadeDuracao = (typeof UNIDADES_DURACAO)[number];

/** Formas de pagamento online de um plano (valem quando o Pagar.me for ligado). */
export const FORMAS_PAGAMENTO = ["pix", "cartao", "boleto"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Meios de pagamento registrados em pedidos e pagamentos. */
export const METODOS_PAGAMENTO = ["pix", "cartao", "boleto", "transferencia", "outro"] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];
export const METODO_PAGAMENTO_LABEL: Record<MetodoPagamento, string> = {
  pix: "Pix",
  cartao: "Cartão de crédito",
  boleto: "Boleto",
  transferencia: "Transferência / TED",
  outro: "Outro",
};

/** Formas que o aluno pode escolher enquanto a confirmação é manual. */
export const FORMAS_MANUAIS = ["pix", "transferencia", "boleto", "cartao"] as const;
export type FormaManual = (typeof FORMAS_MANUAIS)[number];

export const STATUS_PEDIDO = ["pendente", "pago", "cancelado", "expirado", "estornado"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const STATUS_PEDIDO_LABEL: Record<StatusPedido, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  cancelado: "Cancelado",
  expirado: "Prazo vencido",
  estornado: "Estornado",
};

export const STATUS_PAGAMENTO = ["pendente", "pago", "falhou", "cancelado", "estornado"] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];
export const STATUS_PAGAMENTO_LABEL: Record<StatusPagamento, string> = {
  pendente: "Pendente",
  pago: "Pago",
  falhou: "Falhou",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

/** Filtros da lista de pedidos no admin ("cancelado" inclui os de prazo vencido). */
export const FILTROS_PEDIDO = [
  "pendente",
  "revisao",
  "pago",
  "cancelado",
  "estornado",
  "todos",
] as const;
export type FiltroPedido = (typeof FILTROS_PEDIDO)[number];

export const GATEWAYS = ["manual", "pagarme"] as const;
export type Gateway = (typeof GATEWAYS)[number];
export const GATEWAY_LABEL: Record<Gateway, string> = {
  manual: "Manual (o admin confirma o pagamento)",
  pagarme: "Pagar.me",
};

/** 4990 -> "R$ 49,90" */
export function formatarReais(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 4990 -> "49,90" (para campos de edição) */
export function centavosParaTexto(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toFixed(2).replace(".", ",");
}

/**
 * Texto em reais -> centavos, sem passar por número decimal. Aceita
 * "49,90", "49,9", "49.90", "1500", "1.500" (ponto de milhar), "1.234,56" e
 * "R$ 1.200". Devolve null se o texto for inválido ou ambíguo ("1,500").
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$|\s/gi, "");
  let inteiro: string;
  let fracao: string;
  const milhar = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(limpo);
  const simples = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (milhar) {
    inteiro = (milhar[1] ?? "").replace(/\./g, "");
    fracao = milhar[2] ?? "";
  } else if (simples) {
    inteiro = simples[1] ?? "";
    fracao = simples[2] ?? "";
  } else {
    return null;
  }
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** "1 mês", "12 meses", "30 dias" */
export function descreverDuracao(quantidade: number, unidade: string): string {
  if (unidade === "dias") return quantidade === 1 ? "1 dia" : `${quantidade} dias`;
  return quantidade === 1 ? "1 mês" : `${quantidade} meses`;
}

/** "1 simulado", "3 simulados" */
export function textoSimulados(n: number): string {
  return n === 1 ? "1 simulado" : `${n} simulados`;
}

type ConteudoPlano = {
  tipoAcesso: string;
  quantidadeSimulados: number | null;
  duracaoQuantidade: number;
  duracaoUnidade: string;
};

/** O que o plano dá: "3 simulados" (pacote) ou "1 mês", "12 meses" (por tempo). */
export function descreverConteudo(p: ConteudoPlano): string {
  return p.tipoAcesso === "pacote" && p.quantidadeSimulados
    ? textoSimulados(p.quantidadeSimulados)
    : descreverDuracao(p.duracaoQuantidade, p.duracaoUnidade);
}

/** Linha abaixo do preço no card: "por mês" ou "pacote com 3 simulados". */
export function legendaDoPreco(p: ConteudoPlano): string {
  return p.tipoAcesso === "pacote" && p.quantidadeSimulados
    ? `pacote com ${textoSimulados(p.quantidadeSimulados)}`
    : periodoDoPlano(p.duracaoQuantidade, p.duracaoUnidade);
}

/** Texto curto de período para o card do plano: "por mês", "por 12 meses", "por 30 dias". */
export function periodoDoPlano(quantidade: number, unidade: string): string {
  if (unidade === "meses" && quantidade === 1) return "por mês";
  if (unidade === "meses" && quantidade === 12) return "por 12 meses";
  return `por ${descreverDuracao(quantidade, unidade)}`;
}

/** CPF/CNPJ só com parte visível: •••.456.789-•• / 12.345.678/••••-•• */
export function mascararDocumento(doc: string | null | undefined): string {
  if (!doc) return "—";
  if (doc.length === 11) return `•••.${doc.slice(3, 6)}.${doc.slice(6, 9)}-••`;
  if (doc.length === 14) return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/••••-••`;
  return "•••";
}
