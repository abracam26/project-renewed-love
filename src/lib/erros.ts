/** Erros de validação do servidor (zod) chegam como JSON; mostra só a mensagem. */
export function mensagemErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Não foi possível concluir.";
  try {
    const lista = JSON.parse(msg) as { message?: string }[];
    if (Array.isArray(lista) && lista[0]?.message) return lista[0].message;
  } catch {
    // mensagem comum
  }
  return msg;
}
