/** Nome de cada tipo de simulado para exibição. */
const NOME_PROVA: Record<string, string> = {
  ABT1: "ABT1",
  ABT2: "ABT2",
  ABT: "ABT – Correspondentes",
  GRATIS: "Teste grátis",
  LIVRE: "Treino livre",
};

export function nomeProva(tipo: string): string {
  return NOME_PROVA[tipo] ?? tipo;
}
