/**
 * Regras de plano de acesso, usadas no servidor (bloqueio dos simulados) e
 * nas telas (painel do aluno e gestão de usuários).
 *
 * Acesso ativo = plano mensal ou anual com validade até hoje, inclusive,
 * no fuso de São Paulo. Sem acesso ativo, o aluno só faz o teste grátis.
 */

export const PLANOS = ["gratis", "mensal", "anual", "inativo"] as const;
export type Plano = (typeof PLANOS)[number];

export const PLANO_LABEL: Record<Plano, string> = {
  gratis: "Grátis (só teste grátis)",
  mensal: "Mensal",
  anual: "Anual",
  inativo: "Bloqueado",
};

/** Planos que dão acesso aos simulados completos enquanto estiverem na validade. */
export const PLANOS_PAGOS: readonly Plano[] = ["mensal", "anual"];

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export function acessoAtivo(plano: string | null | undefined, validade: string | null | undefined) {
  if (!plano || !validade) return false;
  if (!(PLANOS_PAGOS as readonly string[]).includes(plano)) return false;
  return validade.slice(0, 10) >= hojeSaoPaulo();
}

/** Soma dias a uma data AAAA-MM-DD (sem depender do fuso do navegador). */
export function somarDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** Soma meses a uma data AAAA-MM-DD, ajustando o fim do mês (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(dataIso: string, meses: number): string {
  const [a, m, d] = dataIso.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a!, (m ?? 1) - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(d ?? 1, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/** "2026-10-28" -> "28/10/2026". */
export function formatarDataBR(dataIso: string | null | undefined): string {
  if (!dataIso) return "—";
  const [a, m, d] = dataIso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
