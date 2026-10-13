/** Associados ABRACAM: funções usadas na tela e no servidor. */

/** "Nome@Abracam.com.br", "@abracam.com.br" ou "abracam.com.br" -> "abracam.com.br" */
export function normalizarDominio(v: string) {
  const s = v.trim().toLowerCase();
  return s.slice(s.lastIndexOf("@") + 1).trim();
}

export const DOMINIO_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const PROVEDORES_PESSOAIS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "proton.me",
  "protonmail.com",
]);

/** E-mail de provedor pessoal (gmail, hotmail...), que nunca é o da instituição */
export function emailPessoal(email: string | null | undefined) {
  const dominio = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  return PROVEDORES_PESSOAIS.has(dominio);
}
