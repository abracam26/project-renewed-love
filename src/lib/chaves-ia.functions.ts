import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, type SupabaseAdmin } from "@/lib/auth-servidor";
import { GEMINI_MODEL } from "@/lib/ia.functions";

/**
 * Chaves da API de IA (Gemini ou OpenAI), trocadas pelo Admin em "Gerar com IA".
 *
 * - Até duas chaves: principal e reserva, de qualquer provedor. Se a principal
 *   falhar, a chamada tenta sozinha pela reserva (chamarIA).
 * - O provedor sai da própria chave: "sk-..." é OpenAI; o resto, Gemini ("AIza...").
 * - Sem chave cadastrada no Admin, valem OPENAI_API_KEY / GEMINI_API_KEY do projeto.
 * - A chave nunca volta inteira para o navegador: a tela mostra só o começo e o fim.
 */

export const POSICOES_CHAVE = ["principal", "reserva"] as const;
export type PosicaoChave = (typeof POSICOES_CHAVE)[number];
/** De onde veio a chave usada: cadastrada no Admin ou a do projeto (variável de ambiente) */
export type OrigemChave = PosicaoChave | "projeto";
export type ProvedorIA = "gemini" | "openai";

const PROVEDOR_LABEL: Record<ProvedorIA, string> = { gemini: "Gemini", openai: "OpenAI" };

function provedorDaChave(chave: string): ProvedorIA {
  return chave.startsWith("sk-") ? "openai" : "gemini";
}

/** Modelo da OpenAI (pode ser trocado pela variável OPENAI_MODEL, sem mexer no código). */
function modeloOpenAI() {
  return process.env["OPENAI_MODEL"]?.trim() || "gpt-5-mini";
}

function modeloDe(provedor: ProvedorIA) {
  return provedor === "openai" ? modeloOpenAI() : GEMINI_MODEL;
}

const URL_GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const URL_OPENAI = "https://api.openai.com/v1/chat/completions";

/** Erros que costumam passar sozinhos e valem nova tentativa com a mesma chave. */
const STATUS_PASSAGEIRO = new Set([500, 502, 503, 504]);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ChaveUso = { origem: OrigemChave; chave: string; provedor: ProvedorIA };

function chavesDoProjeto(): ChaveUso[] {
  const lista: ChaveUso[] = [];
  const o = process.env["OPENAI_API_KEY"]?.trim();
  const g = process.env["GEMINI_API_KEY"]?.trim();
  if (o) lista.push({ origem: "projeto", chave: o, provedor: "openai" });
  if (g) lista.push({ origem: "projeto", chave: g, provedor: "gemini" });
  return lista;
}

/** "AIzaSyD...X7k2" -> "AIza••••X7k2" */
function mascarar(chave: string) {
  return `${chave.slice(0, 4)}••••${chave.slice(-4)}`;
}

/** Chaves na ordem de uso: principal, reserva; sem nenhuma no Admin, as do projeto. */
async function chavesEmOrdem(supabaseAdmin: SupabaseAdmin): Promise<ChaveUso[]> {
  const { data, error } = await supabaseAdmin.from("chaves_ia").select("posicao, chave");
  if (error) throw new Error(`Não foi possível ler as chaves de IA: ${error.message}`);
  const lista = POSICOES_CHAVE.flatMap((p) => {
    const c = (data ?? []).find((x) => x.posicao === p);
    return c
      ? [{ origem: p as OrigemChave, chave: c.chave, provedor: provedorDaChave(c.chave) }]
      : [];
  });
  return lista.length > 0 ? lista : chavesDoProjeto();
}

/** O que se pede à IA: instruções, pedido e, para resposta em JSON, o esquema (formato Gemini). */
export type PedidoIA = { sistema?: string; usuario: string; esquema?: object };

function corpoGemini(p: PedidoIA) {
  return JSON.stringify({
    ...(p.sistema ? { systemInstruction: { parts: [{ text: p.sistema }] } } : {}),
    contents: [{ role: "user", parts: [{ text: p.usuario }] }],
    ...(p.esquema
      ? {
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: p.esquema,
          },
        }
      : {}),
  });
}

function corpoOpenAI(p: PedidoIA) {
  // O modo JSON da OpenAI exige um objeto na raiz: a lista vem dentro de "itens"
  const sistema = [
    p.sistema ?? "",
    p.esquema
      ? `Responda SOMENTE com um objeto JSON no formato {"itens": [...]}, em que "itens" segue este esquema: ${JSON.stringify(p.esquema)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return JSON.stringify({
    model: modeloOpenAI(),
    messages: [
      ...(sistema ? [{ role: "system", content: sistema }] : []),
      { role: "user", content: p.usuario },
    ],
    ...(p.esquema ? { response_format: { type: "json_object" } } : {}),
  });
}

async function postar(c: ChaveUso, pedido: PedidoIA): Promise<Response | null> {
  try {
    return c.provedor === "openai"
      ? await fetch(URL_OPENAI, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.chave}` },
          body: corpoOpenAI(pedido),
        })
      : await fetch(URL_GEMINI, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": c.chave },
          body: corpoGemini(pedido),
        });
  } catch (e) {
    console.error(`[${PROVEDOR_LABEL[c.provedor]}] falha de rede:`, e);
    return null;
  }
}

export type RespostaIA = {
  texto: string;
  provedor: ProvedorIA;
  modelo: string;
  origem: OrigemChave;
  tokensEntrada: number | null;
  tokensSaida: number | null;
};

async function lerResposta(c: ChaveUso, res: Response, pedido: PedidoIA): Promise<RespostaIA> {
  const base = { provedor: c.provedor, modelo: modeloDe(c.provedor), origem: c.origem };
  if (c.provedor === "openai") {
    const j = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    let texto = j.choices?.[0]?.message?.content ?? "";
    if (pedido.esquema) {
      try {
        const o = JSON.parse(texto) as unknown;
        if (o && typeof o === "object" && !Array.isArray(o)) {
          const lista = Object.values(o as Record<string, unknown>).find(Array.isArray);
          if (lista) texto = JSON.stringify(lista);
        }
      } catch {
        // Fica o texto como veio: quem chamou acusa o JSON inválido
      }
    }
    return {
      ...base,
      texto,
      tokensEntrada: j.usage?.prompt_tokens ?? null,
      tokensSaida: j.usage?.completion_tokens ?? null,
    };
  }
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    ...base,
    texto: j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "",
    tokensEntrada: j.usageMetadata?.promptTokenCount ?? null,
    tokensSaida: j.usageMetadata?.candidatesTokenCount ?? null,
  };
}

type FalhaChave = { origem: OrigemChave; provedor: ProvedorIA; status: number | null };

/**
 * Chama a IA com a chave principal; se ela falhar, tenta pela reserva.
 * Erro passageiro (sobrecarga) tenta de novo com a mesma chave, esperando
 * entre as tentativas; chave recusada, sem saldo ou outro erro passa direto
 * para a próxima chave. Se todas falharem, lança o erro explicado.
 */
export async function chamarIA(
  supabaseAdmin: SupabaseAdmin,
  pedido: PedidoIA,
  esperasMs: readonly number[] = [3000, 8000],
): Promise<RespostaIA> {
  const chaves = await chavesEmOrdem(supabaseAdmin);
  if (chaves.length === 0) {
    throw new Error(
      "Nenhuma chave de IA cadastrada. Cadastre a chave (Gemini ou OpenAI) em Admin > Gerar com IA > Chave da API de IA.",
    );
  }
  const falhas: FalhaChave[] = [];
  for (const c of chaves) {
    const rotulo = PROVEDOR_LABEL[c.provedor];
    let res: Response | null = null;
    for (let tentativa = 0; tentativa <= esperasMs.length; tentativa++) {
      if (tentativa > 0) await esperar(esperasMs[tentativa - 1] ?? 0);
      res = await postar(c, pedido);
      if (res && (res.ok || !STATUS_PASSAGEIRO.has(res.status))) break;
      console.warn(
        `[${rotulo}] chave ${c.origem}: ${res?.status ?? "sem resposta"} (tentativa ${tentativa + 1})`,
      );
    }
    if (res?.ok) {
      if (c.origem !== "projeto") {
        await supabaseAdmin
          .from("chaves_ia")
          .update({ ultimo_uso_em: new Date().toISOString() })
          .eq("posicao", c.origem);
      }
      return lerResposta(c, res, pedido);
    }
    if (res) {
      console.error(
        `[${rotulo}] chave ${c.origem} falhou ${res.status}: ${(await res.clone().text()).slice(0, 300)}`,
      );
    }
    falhas.push({ origem: c.origem, provedor: c.provedor, status: res?.status ?? null });
  }
  const ultima = falhas[falhas.length - 1];
  const varias = falhas.length > 1 ? " (a chave principal e a reserva falharam)" : "";
  throw new Error(
    `${mensagemErroIA(ultima?.provedor ?? "gemini", ultima?.status ?? null)}${varias}`,
  );
}

/** Texto para o admin a partir do código de erro do provedor. */
function mensagemErroIA(provedor: ProvedorIA, status: number | null): string {
  const nome = PROVEDOR_LABEL[provedor];
  const painel =
    provedor === "openai"
      ? "no painel da OpenAI (platform.openai.com, em Billing)"
      : "no Google AI Studio";
  if (status === null)
    return `Não foi possível conectar ao ${nome}. Verifique a conexão e tente novamente.`;
  if (STATUS_PASSAGEIRO.has(status)) {
    return `O ${nome} está sobrecarregado ou instável no momento (problema do lado do provedor). Aguarde alguns minutos e tente novamente.`;
  }
  if (status === 429) {
    return `O limite de uso (cota ou saldo) da chave do ${nome} foi atingido. Confira o saldo e a cota ${painel}, ou cadastre outra chave.`;
  }
  if (status === 400 || status === 401 || status === 403) {
    return `A chave do ${nome} foi recusada (inválida, expirada ou sem permissão). Confira as chaves em Admin > Gerar com IA > Chave da API de IA.`;
  }
  if (status === 404) return `O modelo ${modeloDe(provedor)} não foi encontrado no ${nome}.`;
  return `O ${nome} respondeu com erro ${status}. Tente novamente em alguns minutos.`;
}

/** Teste rápido de uma chave (uma pergunta curta). */
async function testarUmaChave(chave: string) {
  const c: ChaveUso = { origem: "projeto", chave, provedor: provedorDaChave(chave) };
  const pedido: PedidoIA = { usuario: "Responda apenas: OK" };
  let res: Response | null = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (tentativa > 0) await esperar(1500);
    res = await postar(c, pedido);
    if (res && (res.ok || !STATUS_PASSAGEIRO.has(res.status))) break;
  }
  if (res?.ok) {
    return {
      ok: true as const,
      status: 200,
      provedor: c.provedor,
      mensagem: `Funcionando (${PROVEDOR_LABEL[c.provedor]}, modelo ${modeloDe(c.provedor)}).`,
    };
  }
  if (res) {
    console.error(
      `[${PROVEDOR_LABEL[c.provedor]}] teste da chave: ${res.status} ${(await res.clone().text()).slice(0, 300)}`,
    );
  }
  return {
    ok: false as const,
    status: res?.status ?? null,
    provedor: c.provedor,
    mensagem: mensagemErroIA(c.provedor, res?.status ?? null),
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
      modelo: `${modeloOpenAI()} (OpenAI) ou ${GEMINI_MODEL} (Gemini), conforme a chave`,
      /** Há OPENAI_API_KEY ou GEMINI_API_KEY no projeto (usadas só sem chave cadastrada aqui) */
      chaveDoProjeto: chavesDoProjeto().length > 0,
      chaves: POSICOES_CHAVE.map((posicao) => {
        const l = (linhas ?? []).find((x) => x.posicao === posicao);
        return l
          ? {
              posicao,
              configurada: true as const,
              mascara: mascarar(l.chave),
              provedor: PROVEDOR_LABEL[provedorDaChave(l.chave)],
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
    // Testa antes de gravar: chave recusada pelo provedor não substitui a que está lá
    const teste = await testarUmaChave(data.chave);
    if (!teste.ok && (teste.status === 400 || teste.status === 401 || teste.status === 403)) {
      throw new Error(
        `O ${PROVEDOR_LABEL[teste.provedor]} recusou esta chave (inválida, expirada ou sem permissão). Ela não foi salva. Confira se copiou a chave inteira.`,
      );
    }
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from("chaves_ia").upsert(
      {
        posicao: data.posicao,
        provedor: teste.provedor,
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

/** Testa as chaves cadastradas (ou as do projeto, se não houver nenhuma). */
export const testarChavesIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const chaves = await chavesEmOrdem(supabaseAdmin);
    if (chaves.length === 0) {
      return {
        resultados: [] as { origem: OrigemChave; ok: boolean; mensagem: string }[],
        mensagem:
          "Nenhuma chave cadastrada. Cadastre a chave (Gemini ou OpenAI) em Chave da API de IA.",
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
