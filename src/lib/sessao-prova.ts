/**
 * Sessão da prova guardada na aba em que o simulado começou (sessionStorage).
 * Recarregar a página mantém a sessão; outra aba, ou a mesma aba depois de
 * fechada, não tem a sessão, e o servidor encerra o simulado.
 */

const memoria = new Map<string, string>();
const chave = (simuladoId: string) => `simulado-sessao:${simuladoId}`;

export function guardarSessaoProva(simuladoId: string, sessao: string) {
  memoria.set(simuladoId, sessao);
  try {
    sessionStorage.setItem(chave(simuladoId), sessao);
  } catch {
    // sem armazenamento: vale só enquanto a página não for recarregada
  }
}

export function lerSessaoProva(simuladoId: string): string | null {
  try {
    const v = sessionStorage.getItem(chave(simuladoId));
    if (v) return v;
  } catch {
    // segue para a memória
  }
  return memoria.get(simuladoId) ?? null;
}

export function limparSessaoProva(simuladoId: string) {
  memoria.delete(simuladoId);
  try {
    sessionStorage.removeItem(chave(simuladoId));
  } catch {
    // nada a limpar
  }
}
