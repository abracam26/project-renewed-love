/** Nome de cada tipo de simulado para exibição. */
const NOME_PROVA: Record<string, string> = {
  ABT1: "ABT1",
  ABT2: "ABT2",
  ABT: "ABT – Correspondentes",
  GRATIS_ABT1: "Teste grátis ABT1",
  GRATIS_ABT2: "Teste grátis ABT2",
  GRATIS_ABT: "Teste grátis ABT – Correspondentes",
  GRATIS: "Teste grátis",
  LIVRE: "Treino livre",
};

/** Sigla curta (gráficos e listas apertadas). */
const SIGLA_PROVA: Record<string, string> = {
  ABT1: "ABT1",
  ABT2: "ABT2",
  ABT: "ABT",
  GRATIS_ABT1: "Grátis",
  GRATIS_ABT2: "Grátis",
  GRATIS_ABT: "Grátis",
  GRATIS: "Grátis",
  LIVRE: "Livre",
};

export function nomeProva(tipo: string): string {
  return NOME_PROVA[tipo] ?? tipo;
}

export function siglaProva(tipo: string): string {
  return SIGLA_PROVA[tipo] ?? tipo;
}

/** Os testes grátis (de qualquer prova) valem uma vez por CPF. */
export function ehTesteGratis(tipo: string): boolean {
  return tipo === "GRATIS" || tipo.startsWith("GRATIS_");
}
