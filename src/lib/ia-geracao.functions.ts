import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GEMINI_MODEL } from "@/lib/ia.functions";
import {
  DIFICULDADES,
  EXAMES,
  EXAME_LABEL,
  LETRAS,
  MISTURA_GERACAO_IA,
  NIVEIS,
  TEMAS,
  exameDoId,
  questaoSchema,
  type Exame,
  type QuestaoRow,
} from "@/lib/questoes-schema";
import { REGRAS_GERACAO_PADRAO, REGRAS_GERACAO_PADRAO_ABT } from "@/lib/regras-geracao-padrao";
import type { Database } from "@/integrations/supabase/types";

/**
 * Geração de questões por IA (Gemini), material de referência por tema,
 * regras de geração editáveis e fila de revisão. Todas as funções exigem admin.
 * Cada prova tem material, regras e sequência de IDs próprios: ABT1/ABT2
 * ("ABT12", Material de Apoio) e ABT – Correspondentes ("ABT", e-book).
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");
const exameSchema = z.enum(EXAMES).default("ABT12");

const GERACAO_POR_EXAME: Record<
  Exame,
  {
    /** Chave em configuracoes com as regras editadas pelo admin. */
    chaveRegras: string;
    regrasPadrao: string;
    prefixoId: string;
    versaoMaterial: string;
    nomeMaterial: string;
  }
> = {
  ABT12: {
    chaveRegras: "regras_geracao",
    regrasPadrao: REGRAS_GERACAO_PADRAO,
    prefixoId: "ABT",
    versaoMaterial: "junho/2026",
    nomeMaterial: "MATERIAL DE APOIO",
  },
  ABT: {
    chaveRegras: "regras_geracao_abt",
    regrasPadrao: REGRAS_GERACAO_PADRAO_ABT,
    prefixoId: "ABTC",
    versaoMaterial: "e-book ABT Correspondentes (jul/2026)",
    nomeMaterial: "E-BOOK DA CERTIFICAÇÃO ABT DOS CORRESPONDENTES",
  },
};

async function exigirAdmin(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  const { data: papel } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!papel) throw new Error("Acesso restrito a administradores.");
  return { supabaseAdmin, user: data.user };
}

// ---------------------------------------------------------------------
// Regras de geração (configuracoes.regras_geracao / regras_geracao_abt)
// ---------------------------------------------------------------------
export const obterRegrasGeracao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, exame: exameSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const cfg = GERACAO_POR_EXAME[data.exame];
    const { data: row } = await supabaseAdmin
      .from("configuracoes")
      .select("valor, updated_at")
      .eq("chave", cfg.chaveRegras)
      .maybeSingle();
    return {
      regras: row?.valor ?? cfg.regrasPadrao,
      personalizada: Boolean(row),
      atualizadaEm: row?.updated_at ?? null,
      padrao: cfg.regrasPadrao,
    };
  });

export const salvarRegrasGeracao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        exame: exameSchema,
        regras: z.string().trim().min(50).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin.from("configuracoes").upsert(
      {
        chave: GERACAO_POR_EXAME[data.exame].chaveRegras,
        valor: data.regras,
        updated_by: user.id,
      },
      { onConflict: "chave" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const restaurarRegrasGeracao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, exame: exameSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const cfg = GERACAO_POR_EXAME[data.exame];
    await supabaseAdmin.from("configuracoes").delete().eq("chave", cfg.chaveRegras);
    return { regras: cfg.regrasPadrao };
  });

// ---------------------------------------------------------------------
// Material de referência
// ---------------------------------------------------------------------
export const listarMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, exame: exameSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("material_trechos")
      .select("id, tema, ordem, titulo, versao, updated_at, conteudo")
      .eq("exame", data.exame)
      .order("tema")
      .order("ordem");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      tema: r.tema,
      ordem: r.ordem,
      titulo: r.titulo,
      versao: r.versao,
      atualizadoEm: r.updated_at,
      caracteres: r.conteudo.length,
      previa: r.conteudo.slice(0, 300),
    }));
  });

export const salvarMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        exame: exameSchema,
        id: z.string().uuid().nullable().default(null),
        tema: z.number().int().min(1).max(4),
        ordem: z.number().int().min(1).max(50),
        titulo: z.string().trim().min(3).max(200),
        conteudo: z.string().trim().min(200, "O conteúdo precisa ter pelo menos 200 caracteres."),
        versao: z.string().trim().min(1).max(40).default("junho/2026"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const row = {
      exame: data.exame,
      tema: data.tema,
      ordem: data.ordem,
      titulo: data.titulo,
      conteudo: data.conteudo,
      versao: data.versao,
    };
    const { error } = data.id
      ? await supabaseAdmin
          .from("material_trechos")
          .update(row)
          .eq("id", data.id)
          .eq("exame", data.exame)
      : await supabaseAdmin
          .from("material_trechos")
          .upsert(row, { onConflict: "exame,tema,ordem" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const excluirMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin.from("material_trechos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------
const gerarSchema = z.object({
  token: tokenSchema,
  exame: exameSchema,
  tema: z.number().int().min(1).max(4),
  nivel: z.enum(NIVEIS),
  dificuldade: z.enum(DIFICULDADES).nullable().default(null),
  quantidade: z.number().int().min(1).max(20),
  instrucaoExtra: z.string().trim().max(1000).default(""),
  trechoIds: z.array(z.string().uuid()).default([]),
});

const respostaSchema = z.array(
  z.object({
    subtema: z.string().trim().max(120).optional().nullable(),
    dificuldade: z.enum(DIFICULDADES),
    enunciado: z.string().trim().min(15),
    alternativas: z.array(z.object({ letra: z.enum(LETRAS), texto: z.string().trim().min(2) })),
    gabarito: z.enum(LETRAS),
    explicacao: z.string().trim().min(10),
    fonte_norma: z.string().trim().optional().nullable(),
    fonte_artigo: z.string().trim().optional().nullable(),
    fonte_pagina: z.number().int().min(1).max(999).optional().nullable(),
    tags: z.array(z.string().trim().min(1)).optional().nullable(),
  }),
);

const GEMINI_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      subtema: { type: "STRING" },
      dificuldade: { type: "STRING", enum: ["facil", "media", "dificil"] },
      enunciado: { type: "STRING" },
      alternativas: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            letra: { type: "STRING", enum: ["a", "b", "c", "d"] },
            texto: { type: "STRING" },
          },
          required: ["letra", "texto"],
        },
      },
      gabarito: { type: "STRING", enum: ["a", "b", "c", "d"] },
      explicacao: { type: "STRING" },
      fonte_norma: { type: "STRING" },
      fonte_artigo: { type: "STRING" },
      fonte_pagina: { type: "INTEGER" },
      tags: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["dificuldade", "enunciado", "alternativas", "gabarito", "explicacao", "fonte_norma"],
  },
} as const;

/**
 * No e-book do ABT – Correspondentes muitos fatos não citam norma, mas todo
 * trecho tem página: a página é obrigatória e a norma, opcional.
 */
const GEMINI_RESPONSE_SCHEMA_ABT = {
  ...GEMINI_RESPONSE_SCHEMA,
  items: {
    ...GEMINI_RESPONSE_SCHEMA.items,
    required: [
      "dificuldade",
      "enunciado",
      "alternativas",
      "gabarito",
      "explicacao",
      "fonte_pagina",
    ],
  },
} as const;

function normalizar(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function proximoSequencial(ids: string[], prefixo: string, tema: number) {
  const padrao = new RegExp(`^${prefixo}-T(\\d)-(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const m = padrao.exec(id);
    if (m && Number(m[1]) === tema) max = Math.max(max, Number(m[2]));
  }
  return max + 1;
}

/** Números N das marcas [Página N] presentes no material enviado à IA. */
function paginasDoMaterial(material: string) {
  return new Set([...material.matchAll(/\[Página (\d+)\]/g)].map((m) => Number(m[1])));
}

/** Erros do Gemini que costumam passar sozinhos e valem nova tentativa. */
const STATUS_PASSAGEIRO = new Set([429, 500, 502, 503, 504]);
/** Pausas antes da 2ª e da 3ª tentativa. */
const ESPERAS_GEMINI_MS = [3000, 8000];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mensagemErroGemini(status: number): string {
  if (status === 503 || status === 500 || status === 502 || status === 504) {
    return "O Gemini está sobrecarregado ou instável no momento (problema do lado do Google). Tentamos 3 vezes sem sucesso. Aguarde alguns minutos e tente novamente.";
  }
  if (status === 429) {
    return "O limite de uso da chave do Gemini foi atingido. Aguarde alguns minutos ou confira a cota da chave no Google AI Studio.";
  }
  if (status === 400) {
    return `O Gemini recusou o pedido (erro 400). Confira se a chave GEMINI_API_KEY é válida e se o modelo ${GEMINI_MODEL} aceita este tipo de pedido.`;
  }
  if (status === 401 || status === 403) {
    return "A chave do Gemini foi recusada (sem permissão). Confira a GEMINI_API_KEY configurada no projeto.";
  }
  if (status === 404) {
    return `O modelo ${GEMINI_MODEL} não foi encontrado no Gemini. Confira o nome do modelo.`;
  }
  return `O Gemini respondeu com erro ${status}. Tente novamente em alguns minutos.`;
}

export const gerarQuestoesIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => gerarSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no projeto.");

    const inicio = Date.now();
    const tema = data.tema as 1 | 2 | 3 | 4;
    const exame = data.exame;
    const cfgExame = GERACAO_POR_EXAME[exame];
    const abt = exame === "ABT";
    // No ABT – Correspondentes não há divisão ABT1/ABT2.
    const nivel = abt ? "AMBOS" : data.nivel;
    const mistura = MISTURA_GERACAO_IA[exame];

    // 1. Material do tema
    let consulta = supabaseAdmin
      .from("material_trechos")
      .select("id, titulo, conteudo")
      .eq("exame", exame)
      .eq("tema", tema)
      .order("ordem");
    if (data.trechoIds.length > 0) consulta = consulta.in("id", data.trechoIds);
    const { data: trechos, error: eMat } = await consulta;
    if (eMat) throw new Error(eMat.message);
    if (!trechos || trechos.length === 0) {
      throw new Error(
        `Não há material de referência cadastrado para o tema ${tema} da prova ${EXAME_LABEL[exame]}.`,
      );
    }
    const material = trechos.map((t) => `### ${t.titulo}\n\n${t.conteudo}`).join("\n\n");
    const paginasValidas = paginasDoMaterial(material);

    // 2. Regras e questões existentes (para evitar repetição). O e-book do ABT
    // repete assuntos entre capítulos, então lá a lista cobre todos os temas.
    let consultaExistentes = supabaseAdmin
      .from("questoes")
      .select("tema, subtema, enunciado, fonte_artigo, fonte_pagina")
      .eq("exame", exame)
      .order("created_at", { ascending: false })
      .limit(abt ? 1000 : 400);
    if (!abt) consultaExistentes = consultaExistentes.eq("tema", tema);
    const [{ data: cfg }, { data: existentes, error: eEx }, { data: todosIds }] = await Promise.all(
      [
        supabaseAdmin
          .from("configuracoes")
          .select("valor")
          .eq("chave", cfgExame.chaveRegras)
          .maybeSingle(),
        consultaExistentes,
        supabaseAdmin.from("questoes").select("id").eq("exame", exame).eq("tema", tema),
      ],
    );
    if (eEx) throw new Error(eEx.message);
    const regras = cfg?.valor ?? cfgExame.regrasPadrao;

    const listaExistentes = (existentes ?? [])
      .map((q) =>
        abt
          ? `- Tema ${q.tema} | p. ${q.fonte_pagina ?? "?"} | ${q.subtema ?? ""} | ${q.enunciado.slice(0, 140)}`
          : `- ${q.fonte_artigo ?? ""} | ${q.subtema ?? ""} | ${q.enunciado.slice(0, 140)}`,
      )
      .join("\n");

    const pedido = [
      abt
        ? `Gere ${data.quantidade} questões inéditas do TEMA ${tema} (${TEMAS[tema]}) da Certificação ABT dos Correspondentes.`
        : `Gere ${data.quantidade} questões inéditas do TEMA ${tema} (${TEMAS[tema]}).`,
      ...(abt
        ? []
        : [`Nível: ${nivel === "AMBOS" ? "ABT1 e ABT2 (padrão intermediário)" : nivel}.`]),
      data.dificuldade
        ? `Dificuldade: todas "${data.dificuldade}".`
        : `Dificuldade: misture facil, media e dificil (aprox. ${mistura.facil}% / ${mistura.media}% / ${mistura.dificil}%).`,
      data.instrucaoExtra ? `Instrução adicional do administrador: ${data.instrucaoExtra}` : "",
      "",
      "Responda SOMENTE com o JSON no formato exigido. O campo fonte_pagina é o número que aparece em [Página N] no material, referente ao trecho do gabarito.",
      "",
      existentes && existentes.length > 0
        ? abt
          ? `QUESTÕES JÁ EXISTENTES NESTA PROVA, DE TODOS OS TEMAS (não repita o fato coberto):\n${listaExistentes}`
          : `QUESTÕES JÁ EXISTENTES NESTE TEMA (não repita o fato coberto):\n${listaExistentes}`
        : abt
          ? "Ainda não há questões cadastradas nesta prova."
          : "Ainda não há questões cadastradas neste tema.",
      "",
      `${cfgExame.nomeMaterial} (fonte única):`,
      material,
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    // 3. Chamada ao Gemini, com novas tentativas quando o erro é passageiro
    const corpo = JSON.stringify({
      systemInstruction: { parts: [{ text: regras }] },
      contents: [{ role: "user", parts: [{ text: pedido }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: abt ? GEMINI_RESPONSE_SCHEMA_ABT : GEMINI_RESPONSE_SCHEMA,
      },
    });
    let res: Response | null = null;
    for (let tentativa = 0; tentativa <= ESPERAS_GEMINI_MS.length; tentativa++) {
      if (tentativa > 0) await esperar(ESPERAS_GEMINI_MS[tentativa - 1] ?? 0);
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: corpo,
          },
        );
      } catch (e) {
        console.error(`[Gemini] falha de rede na tentativa ${tentativa + 1}:`, e);
        res = null;
        continue;
      }
      if (res.ok || !STATUS_PASSAGEIRO.has(res.status)) break;
      console.warn(`[Gemini] ${res.status} na tentativa ${tentativa + 1}; tentando de novo.`);
    }
    if (!res) {
      throw new Error(
        "Não foi possível conectar ao Gemini. Verifique a conexão e tente novamente.",
      );
    }
    if (!res.ok) {
      const detalhe = await res.text();
      console.error(`[Gemini] falha ${res.status}: ${detalhe.slice(0, 500)}`);
      throw new Error(mensagemErroGemini(res.status));
    }
    const resposta = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const texto = resposta.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      throw new Error("A resposta da IA não veio em JSON válido. Tente novamente.");
    }
    const parsed = respostaSchema.safeParse(bruto);
    if (!parsed.success) {
      throw new Error(
        `A resposta da IA não seguiu o formato esperado: ${parsed.error.issues[0]?.message ?? ""}`,
      );
    }

    // 4. Registro da geração
    const { data: ger, error: eGer } = await supabaseAdmin
      .from("geracoes_ia")
      .insert({
        user_id: user.id,
        exame,
        tema,
        nivel,
        dificuldade: data.dificuldade,
        quantidade: data.quantidade,
        instrucao_extra: data.instrucaoExtra || null,
        modelo: GEMINI_MODEL,
        tokens_entrada: resposta.usageMetadata?.promptTokenCount ?? null,
        tokens_saida: resposta.usageMetadata?.candidatesTokenCount ?? null,
      })
      .select("id")
      .single();
    if (eGer || !ger) throw new Error(`Falha ao registrar a geração: ${eGer?.message ?? ""}`);

    // 5. Validação com o mesmo esquema da importação e deduplicação
    const enunciadosExistentes = new Set((existentes ?? []).map((q) => normalizar(q.enunciado)));
    const vistosNoLote = new Set<string>();
    let seq = proximoSequencial(
      (todosIds ?? []).map((r) => r.id),
      cfgExame.prefixoId,
      tema,
    );
    const erros: { indice: number; erro: string }[] = [];
    const rows: Omit<QuestaoRow, "created_at" | "updated_at">[] = [];

    parsed.data.forEach((q, i) => {
      const chave = normalizar(q.enunciado);
      if (enunciadosExistentes.has(chave) || vistosNoLote.has(chave)) {
        erros.push({
          indice: i + 1,
          erro: "Enunciado repetido (já existe no banco ou no próprio lote).",
        });
        return;
      }
      if (abt && (!q.fonte_pagina || !paginasValidas.has(q.fonte_pagina))) {
        erros.push({
          indice: i + 1,
          erro: `Página citada (${q.fonte_pagina ?? "nenhuma"}) não está no trecho do e-book usado.`,
        });
        return;
      }
      const id = `${cfgExame.prefixoId}-T${tema}-${String(seq).padStart(4, "0")}`;
      const r = questaoSchema.safeParse({
        id,
        exame,
        tema,
        subtema: q.subtema ?? null,
        nivel,
        dificuldade: q.dificuldade,
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        gabarito: q.gabarito,
        explicacao: q.explicacao,
        fonte: {
          norma: q.fonte_norma ?? null,
          artigo: q.fonte_artigo ?? null,
          pagina_material: q.fonte_pagina ?? null,
        },
        tags: q.tags ?? [],
        status: "rascunho",
      });
      if (!r.success) {
        erros.push({
          indice: i + 1,
          erro: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
        });
        return;
      }
      vistosNoLote.add(chave);
      seq++;
      const v = r.data;
      rows.push({
        id: v.id,
        exame,
        tema,
        tema_nome: TEMAS[tema],
        subtema: v.subtema ?? null,
        nivel: v.nivel,
        dificuldade: v.dificuldade,
        enunciado: v.enunciado,
        alternativas: [...v.alternativas].sort((a, b) => a.letra.localeCompare(b.letra)),
        gabarito: v.gabarito,
        explicacao: v.explicacao ?? null,
        fonte_norma: v.fonte?.norma ?? null,
        fonte_artigo: v.fonte?.artigo ?? null,
        fonte_pagina: v.fonte?.pagina_material ?? null,
        tags: v.tags,
        versao_material: cfgExame.versaoMaterial,
        origem: "ia",
        status: "rascunho",
        ativa: false,
        importacao_id: null,
      });
    });

    if (rows.length > 0) {
      const { error: eIns } = await supabaseAdmin
        .from("questoes")
        .insert(rows.map((r) => ({ ...r, geracao_id: ger.id })));
      if (eIns) throw new Error(`Falha ao gravar as questões geradas: ${eIns.message}`);
    }

    await supabaseAdmin
      .from("geracoes_ia")
      .update({
        geradas: rows.length,
        descartadas: erros.length,
        erros,
        duracao_ms: Date.now() - inicio,
      })
      .eq("id", ger.id);

    const { data: gravadas } = await supabaseAdmin
      .from("questoes")
      .select("*")
      .eq("geracao_id", ger.id)
      .order("id");

    return {
      geracaoId: ger.id,
      geradas: rows.length,
      descartadas: erros.length,
      erros,
      questoes: (gravadas ?? []) as unknown as QuestaoRow[],
      tokens: {
        entrada: resposta.usageMetadata?.promptTokenCount ?? null,
        saida: resposta.usageMetadata?.candidatesTokenCount ?? null,
      },
      duracaoMs: Date.now() - inicio,
    };
  });

// ---------------------------------------------------------------------
// Fila de revisão
// ---------------------------------------------------------------------
export const listarPendentes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        exame: z.enum(EXAMES).nullable().default(null),
        tema: z.number().int().min(1).max(4).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    let q = supabaseAdmin
      .from("questoes")
      .select("*")
      .eq("status", "rascunho")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.exame !== null) q = q.eq("exame", data.exame);
    if (data.tema !== null) q = q.eq("tema", data.tema);
    const contar = (exame: Exame) =>
      supabaseAdmin
        .from("questoes")
        .select("id", { count: "exact", head: true })
        .eq("status", "rascunho")
        .eq("exame", exame);
    const [{ data: rows, error }, c12, cAbt] = await Promise.all([
      q,
      contar("ABT12"),
      contar("ABT"),
    ]);
    if (error) throw new Error(error.message);
    const pendentesPorExame: Record<Exame, number> = {
      ABT12: c12.count ?? 0,
      ABT: cAbt.count ?? 0,
    };
    return { questoes: (rows ?? []) as unknown as QuestaoRow[], pendentesPorExame };
  });

export const aprovarQuestoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, ids: z.array(z.string().min(5)).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error, count } = await supabaseAdmin
      .from("questoes")
      .update({ status: "aprovada", ativa: true }, { count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { aprovadas: count ?? 0 };
  });

const edicaoSchema = z.object({
  token: tokenSchema,
  id: z.string().min(5),
  subtema: z.string().trim().max(120).nullable(),
  nivel: z.enum(NIVEIS),
  dificuldade: z.enum(DIFICULDADES),
  enunciado: z.string().trim().min(15),
  alternativas: z
    .array(z.object({ letra: z.enum(LETRAS), texto: z.string().trim().min(2) }))
    .length(4),
  gabarito: z.enum(LETRAS),
  explicacao: z.string().trim().nullable(),
  fonte_norma: z.string().trim().nullable(),
  fonte_artigo: z.string().trim().nullable(),
  fonte_pagina: z.number().int().min(1).max(999).nullable(),
  aprovar: z.boolean().default(false),
});

export const editarQuestao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => edicaoSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const tema = Number(/-T(\d)-/.exec(data.id)?.[1]);
    const r = questaoSchema.safeParse({
      id: data.id,
      tema,
      subtema: data.subtema,
      // No ABT – Correspondentes não há divisão ABT1/ABT2.
      nivel: exameDoId(data.id) === "ABT" ? "AMBOS" : data.nivel,
      dificuldade: data.dificuldade,
      enunciado: data.enunciado,
      alternativas: data.alternativas,
      gabarito: data.gabarito,
      explicacao: data.explicacao,
      fonte: {
        norma: data.fonte_norma,
        artigo: data.fonte_artigo,
        pagina_material: data.fonte_pagina,
      },
    });
    if (!r.success) {
      throw new Error(r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
    }
    const v = r.data;
    const patch: Database["public"]["Tables"]["questoes"]["Update"] = {
      subtema: v.subtema ?? null,
      nivel: v.nivel,
      dificuldade: v.dificuldade,
      enunciado: v.enunciado,
      alternativas: [...v.alternativas].sort((a, b) => a.letra.localeCompare(b.letra)),
      gabarito: v.gabarito,
      explicacao: v.explicacao ?? null,
      fonte_norma: v.fonte?.norma ?? null,
      fonte_artigo: v.fonte?.artigo ?? null,
      fonte_pagina: v.fonte?.pagina_material ?? null,
    };
    if (data.aprovar) {
      patch.status = "aprovada";
      patch.ativa = true;
    }
    const { error } = await supabaseAdmin.from("questoes").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const historicoGeracoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, exame: exameSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("geracoes_ia")
      .select(
        "id, exame, tema, nivel, dificuldade, quantidade, geradas, descartadas, modelo, tokens_entrada, tokens_saida, duracao_ms, created_at",
      )
      .eq("exame", data.exame)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return { geracoes: rows ?? [] };
  });
