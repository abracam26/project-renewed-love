import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, type SupabaseAdmin } from "@/lib/auth-servidor";
import { GEMINI_MODEL } from "@/lib/ia.functions";

/**
 * Chaves da API de IA (Gemini), trocadas pelo Admin em "Gerar com IA".
 *
 * - Até duas chaves: principal e reserva. Se a principal falhar, a chamada
 *   tenta sozinha pela reserva (chamarGemini).
 * - Sem chave cadastrada no Admin, vale a GEMINI_API_KEY do projeto.
 * - A chave nunca volta inteira para o navegador: a tela mostra só o começo e o fim.
 */

export const POSICOES_CHAVE = ["principal", "reserva"] as const;
export type PosicaoChave = (typeof POSICOES_CHAVE)[number];
/** De onde veio a chave usada: cadastrada no Admin ou a do projeto (variável de ambiente) */
export type OrigemChave = PosicaoChave | "projeto";

const URL_GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Erros que costumam passar sozinhos e valem nova tentativa com a mesma chave. */
const STATUS_PASSAGEIRO = new Set([500, 502, 503, 504]);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chaveDoProjeto() {
  return process.env["GEMINI_API_KEY"]?.trim() || null;
}

/** "AIzaSyD...X7k2" -> "AIza••••X7k2" */
function mascarar(chave: string) {
  return `${chave.slice(0, 4)}••••${chave.slice(-4)}`;
}

/** Chaves na ordem de uso: principal, reserva; sem nenhuma no Admin, a do projeto. */
async function chavesEmOrdem(
  supabaseAdmin: SupabaseAdmin,
): Promise<{ origem: OrigemChave; chave: string }[]> {
  const { data, error } = await supabaseAdmin.from("chaves_ia").select("posicao, chave");
  if (error) throw new Error(`Não foi possível ler as chaves de IA: ${error.message}`);
  const lista = POSICOES_CHAVE.flatMap((p) => {
    const c = (data ?? []).find((x) => x.posicao === p);
    return c ? [{ origem: p as OrigemChave, chave: c.chave }] : [];
  });
  if (lista.length > 0) return lista;
  const projeto = chaveDoProjeto();
  return projeto ? [{ origem: "projeto", chave: projeto }] : [];
}

async function postar(chave: string, corpo: string): Promise<Response | null> {
  try {
    return await fetch(URL_GEMINI, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: corpo,
    });
  } catch (e) {
    console.error("[Gemini] falha de rede:", e);
    return null;
  }
}

export type FalhaChave = { origem: OrigemChave; status: number | null };

/**
 * Chama o Gemini com a chave principal; se ela falhar, tenta pela reserva.
 * Erro passageiro (sobrecarga do Google) tenta de novo com a mesma chave,
 * esperando entre as tentativas; chave recusada, sem cota ou outro erro passa
 * direto para a próxima chave.
 */
export async function chamarGemini(
  supabaseAdmin: SupabaseAdmin,
  corpo: string,
  esperasMs: readonly number[] = [3000, 8000],
): Promise<{ res: Response | null; origem: OrigemChave | null; falhas: FalhaChave[] }> {
  const chaves = await chavesEmOrdem(supabaseAdmin);
  if (chaves.length === 0) {
    throw new Error(
      "Nenhuma chave de IA cadastrada. Cadastre a chave do Gemini em Admin > Gerar com IA > Chave da API de IA.",
    );
  }
  const falhas: FalhaChave[] = [];
  let ultima: Response | null = null;
  let ultimaOrigem: OrigemChave | null = null;
  for (const c of chaves) {
    let res: Response | null = null;
    for (let tentativa = 0; tentativa <= esperasMs.length; tentativa++) {
      if (tentativa > 0) await esperar(esperasMs[tentativa - 1] ?? 0);
      res = await postar(c.chave, corpo);
      if (res && (res.ok || !STATUS_PASSAGEIRO.has(res.status))) break;
      console.warn(
        `[Gemini] chave ${c.origem}: ${res?.status ?? "sem resposta"} (tentativa ${tentativa + 1})`,
      );
    }
    if (res?.ok) {
      if (c.origem !== "projeto") {
        await supabaseAdmin
          .from("chaves_ia")
          .update({ ultimo_uso_em: new Date().toISOString() })
          .eq("posicao", c.origem);
      }
      return { res, origem: c.origem, falhas };
    }
    if (res) {
      console.error(
        `[Gemini] chave ${c.origem} falhou ${res.status}: ${(await res.clone().text()).slice(0, 300)}`,
      );
    }
    falhas.push({ origem: c.origem, status: res?.status ?? null });
    ultima = res;
    ultimaOrigem = c.origem;
  }
  return { res: ultima, origem: ultimaOrigem, falhas };
}

/** Texto para o admin a partir do código de erro do Gemini. */
export function mensagemErroGemini(status: number | null): string {
  if (status === null)
    return "Não foi possível conectar ao Gemini. Verifique a conexão e tente novamente.";
  if ([500, 502, 503, 504].includes(status)) {
    return "O Gemini está sobrecarregado ou instável no momento (problema do lado do Google). Aguarde alguns minutos e tente novamente.";
  }
  if (status === 429) {
    return "O limite de uso (cota ou saldo) da chave do Gemini foi atingido. Confira o saldo e a cota da conta no Google AI Studio, ou cadastre outra chave.";
  }
  if (status === 400 || status === 401 || status === 403) {
    return "A chave do Gemini foi recusada (inválida, expirada ou sem permissão). Confira as chaves em Admin > Gerar com IA > Chave da API de IA.";
  }
  if (status === 404) return `O modelo ${GEMINI_MODEL} não foi encontrado no Gemini.`;
  return `O Gemini respondeu com erro ${status}. Tente novamente em alguns minutos.`;
}

/** Teste rápido de uma chave (uma pergunta curta). */
async function testarUmaChave(chave: string) {
  const corpo = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }],
  });
  let res: Response | null = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (tentativa > 0) await esperar(1500);
    res = await postar(chave, corpo);
    if (res && (res.ok || !STATUS_PASSAGEIRO.has(res.status))) break;
  }
  if (res?.ok) {
    return { ok: true as const, status: 200, mensagem: `Funcionando (modelo ${GEMINI_MODEL}).` };
  }
  return {
    ok: false as const,
    status: res?.status ?? null,
    mensagem: mensagemErroGemini(res?.status ?? null),
  };
}

async function gravarTeste(
  supabaseAdmin: SupabaseAdmin,
  posicao: PosicaoChave,
  r: { ok: boolean; mensagem: string },
) {
  await supabaseAdmin
    .from("chaves_ia")
    .update({
      ultimo_teste_em: new Date().toISOString(),
      ultimo_teste_ok: r.ok,
      ultimo_teste_msg: r.mensagem.slice(0, 500),
    })
    .eq("posicao", posicao);
}

// ---------------------------------------------------------------------
// Tela do Admin
// ---------------------------------------------------------------------
export const obterChavesIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: linhas, error } = await supabaseAdmin
      .from("chaves_ia")
      .select(
        "posicao, chave, atualizado_em, atualizado_por, ultimo_teste_em, ultimo_teste_ok, ultimo_teste_msg, ultimo_uso_em",
      );
    if (error) throw new Error(error.message);
    const autores = [
      ...new Set((linhas ?? []).map((l) => l.atualizado_por).filter((x): x is string => !!x)),
    ];
    const { data: perfis } = autores.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, nome_completo, full_name")
          .in("id", autores)
      : { data: [] as { id: string; nome_completo: string | null; full_name: string | null }[] };
    const nome = (id: string | null) => {
      const p = (perfis ?? []).find((x) => x.id === id);
      return p ? (p.nome_completo ?? p.full_name ?? null) : null;
    };
    return {
      modelo: GEMINI_MODEL,
      /** Há GEMINI_API_KEY no projeto (usada só quando não há chave cadastrada aqui) */
      chaveDoProjeto: Boolean(chaveDoProjeto()),
      chaves: POSICOES_CHAVE.map((posicao) => {
        const l = (linhas ?? []).find((x) => x.posicao === posicao);
        return l
          ? {
              posicao,
              configurada: true as const,
              mascara: mascarar(l.chave),
              atualizadoEm: l.atualizado_em,
              atualizadoPor: nome(l.atualizado_por),
              ultimoTesteEm: l.ultimo_teste_em,
              ultimoTesteOk: l.ultimo_teste_ok,
              ultimoTesteMsg: l.ultimo_teste_msg,
              ultimoUsoEm: l.ultimo_uso_em,
            }
          : { posicao, configurada: false as const };
      }),
    };
  });

const chaveSchema = z
  .string()
  .transform((v) => v.trim())
  .refine(
    (v) => v.length >= 20 && v.length <= 300,
    "A chave parece incompleta. Copie a chave inteira.",
  )
  .refine((v) => !/\s/.test(v), "A chave não pode ter espaços ou quebras de linha.");

export const salvarChaveIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, posicao: z.enum(POSICOES_CHAVE), chave: chaveSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    // Testa antes de gravar: chave recusada pelo Google não substitui a que está lá
    const teste = await testarUmaChave(data.chave);
    if (!teste.ok && (teste.status === 400 || teste.status === 401 || teste.status === 403)) {
      throw new Error(
        "O Gemini recusou esta chave (inválida, expirada ou sem permissão). Ela não foi salva. Confira se copiou a chave inteira no Google AI Studio.",
      );
    }
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from("chaves_ia").upsert(
      {
        posicao: data.posicao,
        provedor: "gemini",
        chave: data.chave,
        atualizado_em: agora,
        atualizado_por: user.id,
        ultimo_teste_em: agora,
        ultimo_teste_ok: teste.ok,
        ultimo_teste_msg: teste.mensagem.slice(0, 500),
      },
      { onConflict: "posicao" },
    );
    if (error) throw new Error(error.message);
    return { teste: { ok: teste.ok, mensagem: teste.mensagem } };
  });

export const removerChaveIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, posicao: z.enum(POSICOES_CHAVE) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin.from("chaves_ia").delete().eq("posicao", data.posicao);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const trocarChavesIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin.rpc("trocar_chaves_ia", { p_por: user.id });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Testa as chaves cadastradas (ou a do projeto, se não houver nenhuma). */
export const testarChavesIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const chaves = await chavesEmOrdem(supabaseAdmin);
    if (chaves.length === 0) {
      return {
        resultados: [] as { origem: OrigemChave; ok: boolean; mensagem: string }[],
        mensagem: "Nenhuma chave cadastrada. Cadastre a chave do Gemini em Chave da API de IA.",
      };
    }
    const resultados = await Promise.all(
      chaves.map(async (c) => {
        const r = await testarUmaChave(c.chave);
        if (c.origem !== "projeto") await gravarTeste(supabaseAdmin, c.origem, r);
        return { origem: c.origem, ok: r.ok, mensagem: r.mensagem };
      }),
    );
    return { resultados, mensagem: null };
  });
