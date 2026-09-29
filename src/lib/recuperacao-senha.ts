import { supabase } from "@/integrations/supabase/client";

/**
 * "Esqueci minha senha": o aluno pede o link na tela de entrada (ou no
 * Perfil), abre o e-mail e chega em /redefinir-senha já com uma sessão de
 * recuperação, onde cria a nova senha.
 *
 * O link do e-mail traz os dados da sessão no final do endereço (#...). O
 * cliente do Supabase confere esses dados e, só se forem válidos, avisa com o
 * evento PASSWORD_RECOVERY. Nesse momento guardamos na aba uma marca com o
 * usuário do link, para a página de nova senha saber que a sessão veio de um
 * link de recuperação válido (e não de um login comum).
 */

export const CAMINHO_REDEFINIR = "/redefinir-senha";
export const EVENTO_RECUPERACAO = "abt:recuperacao-senha";
const CHAVE_MARCA = "abt:recuperacao-senha";
const CHAVE_ERRO = "abt:recuperacao-senha-erro";
/** A marca vale por 1 hora (tempo para criar a senha depois de abrir o link). */
const VALIDADE_MARCA_MS = 60 * 60 * 1000;

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: a página de nova senha mostra "link inválido"
  }
}

function ler(chave: string) {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function naPaginaDeRedefinir() {
  return window.location.pathname.replace(/\/$/, "") === CAMINHO_REDEFINIR;
}

function avisarPagina() {
  window.dispatchEvent(new Event(EVENTO_RECUPERACAO));
}

/** Traduz as mensagens do serviço de login sobre senha e envio de e-mail. */
export function traduzirErroSenha(mensagem: string): string {
  const m = mensagem.toLowerCase();
  const segundos = /after (\d+) seconds?/i.exec(mensagem)?.[1];
  if (segundos) return `Por segurança, aguarde ${segundos} segundos antes de pedir outro link.`;
  if (m.includes("rate limit")) {
    return "Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.";
  }
  if (m.includes("invalid format") || m.includes("unable to validate email"))
    return "E-mail inválido.";
  if (m.includes("should be different")) {
    return "A nova senha precisa ser diferente da senha atual.";
  }
  const minimo = /at least (\d+) characters?/i.exec(mensagem)?.[1];
  const tipos = m.includes("one character of each");
  if (minimo || tipos) {
    const partes = [
      minimo && `ter pelo menos ${minimo} caracteres`,
      tipos && "misturar letras minúsculas, maiúsculas e números (e símbolos, se for exigido)",
    ].filter(Boolean);
    return `A senha precisa ${partes.join(" e ")}.`;
  }
  if (m.includes("weak") || m.includes("pwned") || m.includes("leaked")) {
    return "Essa senha é fraca ou já apareceu em vazamentos de dados. Escolha outra senha.";
  }
  if (m.includes("session") && (m.includes("missing") || m.includes("expired"))) {
    return "O link expirou. Peça um novo link em “Esqueci minha senha”.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
    return "Sem conexão com o servidor. Confira sua internet e tente de novo.";
  }
  return mensagem;
}

/** Envia o e-mail com o link para criar uma nova senha. */
export async function enviarLinkDeRecuperacao(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin + CAMINHO_REDEFINIR,
  });
  if (error) throw new Error(traduzirErroSenha(error.message));
}

/** A sessão deste usuário veio de um link de recuperação válido, aberto há pouco nesta aba? */
export function recuperacaoAtiva(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    const marca = JSON.parse(ler(CHAVE_MARCA) ?? "null") as {
      quando?: unknown;
      userId?: unknown;
    } | null;
    return (
      marca !== null &&
      marca.userId === userId &&
      typeof marca.quando === "number" &&
      Date.now() - marca.quando < VALIDADE_MARCA_MS
    );
  } catch {
    return false;
  }
}

/** Código de erro do link (por exemplo, link expirado ou já usado). */
export function erroDoLink() {
  return ler(CHAVE_ERRO);
}

export function encerrarRecuperacao() {
  gravar(CHAVE_MARCA, null);
  gravar(CHAVE_ERRO, null);
}

/** Esta aba abriu um link de recuperação que ainda está sendo conferido. */
let linkNestaAba = false;
let linkPendente = false;

export function linkEmVerificacao() {
  return linkPendente;
}

let escutando = false;

/**
 * Chamada uma vez, no carregamento do app (navegador). Lê o final do
 * endereço antes que o cliente do Supabase o consuma e, se o link de
 * recuperação abrir em outra página, leva o aluno para /redefinir-senha.
 * Só a aba que abriu o link reage: as outras abas do app não são afetadas.
 */
export function escutarRecuperacaoDeSenha() {
  if (escutando || typeof window === "undefined") return;
  escutando = true;

  const dados = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  linkNestaAba = dados.get("type") === "recovery" && Boolean(dados.get("access_token"));
  linkPendente = linkNestaAba;
  if (linkNestaAba) {
    gravar(CHAVE_ERRO, null);
  } else if (naPaginaDeRedefinir() && (dados.get("error_code") || dados.get("error"))) {
    gravar(CHAVE_ERRO, dados.get("error_code") ?? dados.get("error"));
  }

  supabase.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "SIGNED_OUT") {
      encerrarRecuperacao();
      return;
    }
    // O evento só chega depois que o Supabase validou e salvou a sessão do link
    if (evento !== "PASSWORD_RECOVERY" || !linkNestaAba || !sessao) return;
    linkNestaAba = false;
    linkPendente = false;
    gravar(CHAVE_MARCA, JSON.stringify({ quando: Date.now(), userId: sessao.user.id }));
    gravar(CHAVE_ERRO, null);
    avisarPagina();
    if (!naPaginaDeRedefinir()) window.location.replace(CAMINHO_REDEFINIR);
  });

  // Link recusado (expirado, já usado ou incompleto): o Supabase não emite o
  // evento. Depois da leitura do link, avisa a página que ele não vale.
  if (linkPendente) {
    void supabase.auth.initialize().then(({ error }) => {
      window.setTimeout(() => {
        if (!linkPendente) return;
        linkNestaAba = false;
        linkPendente = false;
        if (naPaginaDeRedefinir()) gravar(CHAVE_ERRO, error ? "link_invalido" : "link_sem_sessao");
        avisarPagina();
      }, 0);
    });
  }
}
