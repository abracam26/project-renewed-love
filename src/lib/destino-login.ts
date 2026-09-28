/**
 * Página que o visitante tentou abrir antes de ser mandado para o login.
 * Depois de entrar, ele volta para ela em vez de cair sempre no painel.
 */

const CHAVE = "destino-apos-login";

function caminhoInterno(v: string | null): v is string {
  return Boolean(v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/auth"));
}

export function guardarDestinoAposLogin(href: string) {
  if (!caminhoInterno(href) || href === "/") return;
  try {
    sessionStorage.setItem(CHAVE, href);
  } catch {
    // sem armazenamento: depois do login vai para o painel
  }
}

/** Lê e apaga o destino guardado. Sem destino, volta para o painel. */
export function consumirDestinoAposLogin(): string {
  try {
    const v = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    if (caminhoInterno(v)) return v;
  } catch {
    // segue para o painel
  }
  return "/";
}
