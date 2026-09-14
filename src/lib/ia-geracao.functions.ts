import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GEMINI_MODEL } from "@/lib/ia.functions";
import {
  DIFICULDADES,
  LETRAS,
  NIVEIS,
  TEMAS,
  questaoSchema,
  type QuestaoRow,
} from "@/lib/questoes-schema";
import { REGRAS_GERACAO_PADRAO } from "@/lib/regras-geracao-padrao";
import type { Database } from "@/integrations/supabase/types";

/**
 * Geração de questões por IA (Gemini), material de referência por tema,
 * regras de geração editáveis e fila de revisão. Todas as funções exigem admin.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

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
// Regras de geração (configuracoes.regras_geracao)
// ---------------------------------------------------------------------
export const obterRegrasGeracao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: row } = await supabaseAdmin
      .from("configuracoes")
      .select("valor, updated_at")
      .eq("chave", "regras_geracao")
      .maybeSingle();
    return {
      regras: row?.valor ?? REGRAS_GERACAO_PADRAO,
      personalizada: Boolean(row),
      atualizadaEm: row?.updated_at ?? null,
      padrao: REGRAS_GERACAO_PADRAO,
    };
  });

export const salvarRegrasGeracao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, regras: z.string().trim().min(50).max(20000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin
      .from("configuracoes")
      .upsert(
        { chave: "regras_geracao", valor: data.regras, updated_by: user.id },
        { onConflict: "chave" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const restaurarRegrasGeracao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    await supabaseAdmin.from("configuracoes").delete().eq("chave", "regras_geracao");
    return { regras: REGRAS_GERACAO_PADRAO };
  });

// ---------------------------------------------------------------------
// Material de referência
// ---------------------------------------------------------------------
export const listarMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("material_trechos")
      .select("id, tema, ordem, titulo, versao, updated_at, conteudo")
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
      tema: data.tema,
      ordem: data.ordem,
      titulo: data.titulo,
      conteudo: data.conteudo,
      versao: data.versao,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("material_trechos").update(row).eq("id", data.id)
      : await supabaseAdmin.from("material_trechos").upsert(row, { onConflict: "tema,ordem" });
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

function normalizar(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function proximoSequencial(ids: string[], tema: number) {
  let max = 0;
  for (const id of ids) {
    const m = /^ABT-T(\d)-(\d+)$/.exec(id);
    if (m && Number(m[1]) === tema) max = Math.max(max, Number(m[2]));
  }
  return max + 1;
}

export const gerarQuestoesIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => gerarSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no projeto.");

    const inicio = Date.now();
    const tema = data.tema as 1 | 2 | 3 | 4;

    // 1. Material do tema
    let consulta = supabaseAdmin
      .from("material_trechos")
      .select("id, titulo, conteudo")
      .eq("tema", tema)
      .order("ordem");
    if (data.trechoIds.length > 0) consulta = consulta.in("id", data.trechoIds);
    const { data: trechos, error: eMat } = await consulta;
    if (eMat) throw new Error(eMat.message);
    if (!trechos || trechos.length === 0) {
      throw new Error(`Não há material de referência cadastrado para o tema ${tema}.`);
    }
    const material = trechos.map((t) => `### ${t.titulo}\n\n${t.conteudo}`).join("\n\n");

    // 2. Regras e questões existentes do tema (para evitar repetição)
    const [{ data: cfg }, { data: existentes, error: eEx }, { data: todosIds }] = await Promise.all(
      [
        supabaseAdmin
          .from("configuracoes")
          .select("valor")
          .eq("chave", "regras_geracao")
          .maybeSingle(),
        supabaseAdmin
          .from("questoes")
          .select("subtema, enunciado, fonte_artigo")
          .eq("tema", tema)
          .order("created_at", { ascending: false })
          .limit(400),
        supabaseAdmin.from("questoes").select("id").eq("tema", tema),
      ],
    );
    if (eEx) throw new Error(eEx.message);
    const regras = cfg?.valor ?? REGRAS_GERACAO_PADRAO;

    const listaExistentes = (existentes ?? [])
      .map((q) => `- ${q.fonte_artigo ?? ""} | ${q.subtema ?? ""} | ${q.enunciado.slice(0, 140)}`)
      .join("\n");

    const pedido = [
      `Gere ${data.quantidade} questões inéditas do TEMA ${tema} (${TEMAS[tema]}).`,
      `Nível: ${data.nivel === "AMBOS" ? "ABT1 e ABT2 (padrão intermediário)" : data.nivel}.`,
      data.dificuldade
        ? `Dificuldade: todas "${data.dificuldade}".`
        : "Dificuldade: misture facil, media e dificil (aprox. 40% / 40% / 20%).",
      data.instrucaoExtra ? `Instrução adicional do administrador: ${data.instrucaoExtra}` : "",
      "",
      "Responda SOMENTE com o JSON no formato exigido. O campo fonte_pagina é o número que aparece em [Página N] no material, referente ao trecho do gabarito.",
      "",
      existentes && existentes.length > 0
        ? `QUESTÕES JÁ EXISTENTES NESTE TEMA (não repita o fato coberto):\n${listaExistentes}`
        : "Ainda não há questões cadastradas neste tema.",
      "",
      "MATERIAL DE APOIO (fonte única):",
      material,
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    // 3. Chamada ao Gemini
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: regras }] },
          contents: [{ role: "user", parts: [{ text: pedido }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
      },
    );
    if (!res.ok) {
      const detalhe = await res.text();
      console.error(`[Gemini] falha ${res.status}: ${detalhe.slice(0, 500)}`);
      throw new Error(
        `O Gemini respondeu ${res.status}. Verifique a chave e o modelo ${GEMINI_MODEL}.`,
      );
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
        tema,
        nivel: data.nivel,
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
      const id = `ABT-T${tema}-${String(seq).padStart(4, "0")}`;
      const r = questaoSchema.safeParse({
        id,
        tema,
        subtema: q.subtema ?? null,
        nivel: data.nivel,
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
        versao_material: "junho/2026",
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
      .object({ token: tokenSchema, tema: z.number().int().min(1).max(4).nullable().default(null) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    let q = supabaseAdmin
      .from("questoes")
      .select("*")
      .eq("status", "rascunho")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.tema !== null) q = q.eq("tema", data.tema);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { questoes: (rows ?? []) as unknown as QuestaoRow[] };
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
    const tema = Number(data.id.charAt(5));
    const r = questaoSchema.safeParse({
      id: data.id,
      tema,
      subtema: data.subtema,
      nivel: data.nivel,
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
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("geracoes_ia")
      .select(
        "id, tema, nivel, dificuldade, quantidade, geradas, descartadas, modelo, tokens_entrada, tokens_saida, duracao_ms, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return { geracoes: rows ?? [] };
  });
