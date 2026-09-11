import { z } from "zod";

/**
 * Esquema compartilhado (cliente e servidor) de uma questão do simulador.
 * Espelha a tabela public.questoes.
 */

export const TEMAS: Record<1 | 2 | 3 | 4, string> = {
  1: "Mercado de câmbio",
  2: "PLD/FTP",
  3: "Organização do SFN",
  4: "Correspondente cambial",
};

/** Proporção oficial da prova (40 questões). */
export const PROPORCAO_PROVA: Record<1 | 2 | 3 | 4, number> = { 1: 18, 2: 14, 3: 5, 4: 3 };

export const NIVEIS = ["ABT1", "ABT2", "AMBOS"] as const;
export const DIFICULDADES = ["facil", "media", "dificil"] as const;
export const LETRAS = ["a", "b", "c", "d"] as const;

export type Nivel = (typeof NIVEIS)[number];
export type Dificuldade = (typeof DIFICULDADES)[number];
export type Letra = (typeof LETRAS)[number];

const texto = (min: number, campo: string) =>
  z
    .string({ required_error: `${campo} é obrigatório.` })
    .trim()
    .min(min, `${campo} precisa ter pelo menos ${min} caracteres.`);

export const alternativaSchema = z.object({
  letra: z.enum(LETRAS),
  texto: texto(2, "Texto da alternativa"),
});

export const questaoSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(
        /^ABT-T[1-4]-\d{3,5}$/,
        "ID deve seguir o padrão ABT-T{tema}-{sequencial}, ex.: ABT-T1-0001.",
      ),
    tema: z.coerce.number().int().min(1).max(4),
    tema_nome: z.string().trim().optional(),
    subtema: z.string().trim().max(120).optional().nullable(),
    nivel: z.enum(NIVEIS),
    dificuldade: z.enum(DIFICULDADES),
    enunciado: texto(15, "Enunciado"),
    alternativas: z
      .array(alternativaSchema)
      .length(4, "A questão precisa ter exatamente 4 alternativas.")
      .refine(
        (alts) => LETRAS.every((l) => alts.some((a) => a.letra === l)),
        "As alternativas precisam ser a, b, c e d.",
      ),
    gabarito: z.enum(LETRAS),
    explicacao: z.string().trim().optional().nullable(),
    fonte: z
      .object({
        norma: z.string().trim().optional().nullable(),
        artigo: z.string().trim().optional().nullable(),
        pagina_material: z.coerce.number().int().min(1).max(999).optional().nullable(),
      })
      .optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
    versao_material: z.string().trim().default("junho/2026"),
    status: z.enum(["rascunho", "aprovada"]).default("aprovada"),
  })
  .superRefine((q, ctx) => {
    const temaDoId = Number(q.id.charAt(5));
    if (temaDoId !== q.tema) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: `O tema do ID (T${temaDoId}) não confere com o campo tema (${q.tema}).`,
      });
    }
    const textos = q.alternativas.map((a) => a.texto.toLowerCase());
    if (new Set(textos).size !== textos.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativas"],
        message: "Há alternativas com texto repetido.",
      });
    }
  });

export type QuestaoInput = z.input<typeof questaoSchema>;
export type Questao = z.output<typeof questaoSchema>;

/** Linha da tabela public.questoes, como retornada pelo banco. */
export type QuestaoRow = {
  id: string;
  tema: number;
  tema_nome: string;
  subtema: string | null;
  nivel: Nivel;
  dificuldade: Dificuldade;
  enunciado: string;
  alternativas: { letra: Letra; texto: string }[];
  gabarito: Letra;
  explicacao: string | null;
  fonte_norma: string | null;
  fonte_artigo: string | null;
  fonte_pagina: number | null;
  tags: string[];
  versao_material: string;
  origem: "manual" | "ia" | "importacao";
  status: "rascunho" | "aprovada";
  ativa: boolean;
  importacao_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Converte uma questão validada para o formato de linha do banco. */
export function questaoParaRow(
  q: Questao,
  importacaoId: string | null,
): Omit<QuestaoRow, "created_at" | "updated_at"> {
  const tema = q.tema as 1 | 2 | 3 | 4;
  return {
    id: q.id,
    tema,
    tema_nome: q.tema_nome && q.tema_nome.length > 0 ? q.tema_nome : TEMAS[tema],
    subtema: q.subtema ?? null,
    nivel: q.nivel,
    dificuldade: q.dificuldade,
    enunciado: q.enunciado,
    alternativas: [...q.alternativas].sort((a, b) => a.letra.localeCompare(b.letra)),
    gabarito: q.gabarito,
    explicacao: q.explicacao ?? null,
    fonte_norma: q.fonte?.norma ?? null,
    fonte_artigo: q.fonte?.artigo ?? null,
    fonte_pagina: q.fonte?.pagina_material ?? null,
    tags: q.tags,
    versao_material: q.versao_material,
    origem: "importacao",
    status: q.status,
    ativa: true,
    importacao_id: importacaoId,
  };
}

// ---------------------------------------------------------------------
// Leitura de arquivos (JSON e CSV) para o formato de entrada
// ---------------------------------------------------------------------

export type LinhaLida = { indice: number; bruto: unknown };

/** Aceita um array de questões ou um objeto { questoes: [...] }. */
export function lerJson(conteudo: string): LinhaLida[] {
  const dados: unknown = JSON.parse(conteudo);
  const lista = Array.isArray(dados)
    ? dados
    : dados &&
        typeof dados === "object" &&
        Array.isArray((dados as { questoes?: unknown }).questoes)
      ? (dados as { questoes: unknown[] }).questoes
      : null;
  if (!lista)
    throw new Error("O JSON precisa ser um array de questões ou um objeto { questoes: [...] }.");
  return lista.map((bruto, indice) => ({ indice: indice + 1, bruto }));
}

/** Parser CSV simples (RFC 4180): vírgula ou ponto e vírgula, aspas duplas, quebras de linha em campos. */
export function parseCsv(conteudo: string): string[][] {
  const texto = conteudo.replace(/^\uFEFF/, "");
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (primeiraLinha.match(/;/g)?.length ?? 0) > (primeiraLinha.match(/,/g)?.length ?? 0) ? ";" : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] as string;
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim().length > 0));
}

/** Colunas esperadas no CSV (ordem livre, nomes em minúsculas). */
export const COLUNAS_CSV = [
  "id",
  "tema",
  "nivel",
  "dificuldade",
  "subtema",
  "enunciado",
  "alt_a",
  "alt_b",
  "alt_c",
  "alt_d",
  "gabarito",
  "explicacao",
  "norma",
  "artigo",
  "pagina",
  "tags",
] as const;

export function lerCsv(conteudo: string): LinhaLida[] {
  const linhas = parseCsv(conteudo);
  const cabecalho = (linhas[0] ?? []).map((h) => h.trim().toLowerCase());
  const obrigatorias = [
    "id",
    "tema",
    "nivel",
    "dificuldade",
    "enunciado",
    "alt_a",
    "alt_b",
    "alt_c",
    "alt_d",
    "gabarito",
  ];
  const faltando = obrigatorias.filter((c) => !cabecalho.includes(c));
  if (faltando.length > 0)
    throw new Error(`CSV sem as colunas obrigatórias: ${faltando.join(", ")}.`);

  const idx = (nome: string) => cabecalho.indexOf(nome);
  const val = (l: string[], nome: string) => {
    const i = idx(nome);
    return i >= 0 ? (l[i] ?? "").trim() : "";
  };

  return linhas.slice(1).map((l, i) => ({
    indice: i + 1,
    bruto: {
      id: val(l, "id"),
      tema: val(l, "tema"),
      nivel: val(l, "nivel").toUpperCase(),
      dificuldade: val(l, "dificuldade").toLowerCase(),
      subtema: val(l, "subtema") || null,
      enunciado: val(l, "enunciado"),
      alternativas: LETRAS.map((letra) => ({ letra, texto: val(l, `alt_${letra}`) })),
      gabarito: val(l, "gabarito").toLowerCase(),
      explicacao: val(l, "explicacao") || null,
      fonte: {
        norma: val(l, "norma") || null,
        artigo: val(l, "artigo") || null,
        pagina_material: val(l, "pagina") ? Number(val(l, "pagina")) : null,
      },
      tags: val(l, "tags")
        ? val(l, "tags")
            .split(/[;|]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    },
  }));
}

export type ResultadoValidacao =
  | { ok: true; indice: number; questao: Questao }
  | { ok: false; indice: number; id: string | null; erros: string[] };

export function validarLinhas(linhas: LinhaLida[]): ResultadoValidacao[] {
  const vistos = new Map<string, number>();
  return linhas.map(({ indice, bruto }) => {
    const r = questaoSchema.safeParse(bruto);
    if (!r.success) {
      const id =
        bruto && typeof bruto === "object" && typeof (bruto as { id?: unknown }).id === "string"
          ? (bruto as { id: string }).id
          : null;
      const erros = r.error.issues.map((i) => `${i.path.join(".") || "questão"}: ${i.message}`);
      return { ok: false, indice, id, erros };
    }
    const anterior = vistos.get(r.data.id);
    if (anterior !== undefined) {
      return {
        ok: false,
        indice,
        id: r.data.id,
        erros: [`ID repetido no arquivo (já usado na linha ${anterior}).`],
      };
    }
    vistos.set(r.data.id, indice);
    return { ok: true, indice, questao: r.data };
  });
}
