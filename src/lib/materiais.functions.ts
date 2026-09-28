import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, usuarioLogado, type SupabaseAdmin } from "@/lib/auth-servidor";

/**
 * Materiais em PDF (página PDFs). Só o admin envia; qualquer aluno logado
 * baixa. Os arquivos ficam no Storage do Supabase, num bucket privado; o
 * download usa um link temporário gerado pelo servidor.
 */

export const BUCKET_MATERIAIS = "materiais";
export const TAMANHO_MAXIMO_PDF = 50 * 1024 * 1024; // limite do plano gratuito do Supabase

async function garantirBucket(supabaseAdmin: SupabaseAdmin) {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET_MATERIAIS);
  if (data) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET_MATERIAIS, {
    public: false,
    fileSizeLimit: TAMANHO_MAXIMO_PDF,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Falha ao preparar o armazenamento dos arquivos: ${error.message}`);
  }
}

type MaterialRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  ativo: boolean;
  ordem: number;
  downloads: number;
  created_at: string;
};

const CAMPOS =
  "id, titulo, descricao, categoria, nome_arquivo, tamanho_bytes, ativo, ordem, downloads, created_at";

// ---------------------------------------------------------------------
// Aluno: listar e baixar
// ---------------------------------------------------------------------
export const listarMateriais = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await usuarioLogado(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("materiais")
      .select(CAMPOS)
      .eq("ativo", true)
      .order("ordem")
      .order("created_at", { ascending: false })
      .returns<MaterialRow[]>();
    if (error) throw new Error(error.message);
    return {
      materiais: (rows ?? []).map((m) => ({
        id: m.id,
        titulo: m.titulo,
        descricao: m.descricao,
        categoria: m.categoria,
        tamanho_bytes: m.tamanho_bytes,
        created_at: m.created_at,
      })),
    };
  });

export const linkDownloadMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await usuarioLogado(data.token);
    const { data: m, error } = await supabaseAdmin
      .from("materiais")
      .select("id, arquivo_path, nome_arquivo, ativo, downloads")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m || !m.ativo) throw new Error("Material não encontrado.");

    const { data: link, error: eLink } = await supabaseAdmin.storage
      .from(BUCKET_MATERIAIS)
      .createSignedUrl(m.arquivo_path, 5 * 60, { download: m.nome_arquivo });
    if (eLink || !link) throw new Error("Não foi possível gerar o download. Tente novamente.");

    await supabaseAdmin
      .from("materiais")
      .update({ downloads: m.downloads + 1 })
      .eq("id", m.id);
    return { url: link.signedUrl };
  });

// ---------------------------------------------------------------------
// Admin: enviar, editar e excluir
// ---------------------------------------------------------------------
export const listarMateriaisAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("materiais")
      .select(CAMPOS)
      .order("ordem")
      .order("created_at", { ascending: false })
      .returns<MaterialRow[]>();
    if (error) throw new Error(error.message);
    return { materiais: rows ?? [] };
  });

/** Passo 1 do envio: o servidor devolve um endereço temporário para o navegador enviar o PDF. */
export const prepararEnvioMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        nomeArquivo: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .refine((v) => /\.pdf$/i.test(v), "Envie um arquivo PDF."),
        tamanho: z
          .number()
          .int()
          .positive()
          .max(TAMANHO_MAXIMO_PDF, "O arquivo passa de 50 MB, o limite do armazenamento."),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    await garantirBucket(supabaseAdmin);
    const caminho = `${crypto.randomUUID()}.pdf`;
    const { data: envio, error } = await supabaseAdmin.storage
      .from(BUCKET_MATERIAIS)
      .createSignedUploadUrl(caminho);
    if (error || !envio) throw new Error(`Falha ao preparar o envio: ${error?.message ?? ""}`);
    return { caminho: envio.path, tokenEnvio: envio.token };
  });

/** Passo 2 do envio: confere se o arquivo chegou e registra o material. */
export const registrarMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        caminho: z.string().regex(/^[0-9a-f-]{36}\.pdf$/, "Arquivo inválido."),
        nomeArquivo: z.string().trim().min(1).max(200),
        titulo: z.string().trim().min(3, "Informe o título.").max(150),
        descricao: z.string().trim().max(500).default(""),
        categoria: z.string().trim().min(2).max(60).default("Material de Apoio"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);

    const { data: achados, error: eList } = await supabaseAdmin.storage
      .from(BUCKET_MATERIAIS)
      .list("", { search: data.caminho, limit: 1 });
    const arquivo = (achados ?? []).find((a) => a.name === data.caminho);
    if (eList || !arquivo) throw new Error("O arquivo não chegou ao armazenamento. Envie de novo.");
    const tamanho = Number((arquivo.metadata as { size?: number } | null)?.size ?? 0) || 1;

    const { error } = await supabaseAdmin.from("materiais").insert({
      titulo: data.titulo,
      descricao: data.descricao || null,
      categoria: data.categoria,
      arquivo_path: data.caminho,
      nome_arquivo: data.nomeArquivo,
      tamanho_bytes: tamanho,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const atualizarMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        id: z.string().uuid(),
        titulo: z.string().trim().min(3, "Informe o título.").max(150),
        descricao: z.string().trim().max(500).default(""),
        categoria: z.string().trim().min(2).max(60),
        ativo: z.boolean(),
        ordem: z.number().int().min(0).max(9999),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin
      .from("materiais")
      .update({
        titulo: data.titulo,
        descricao: data.descricao || null,
        categoria: data.categoria,
        ativo: data.ativo,
        ordem: data.ordem,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const excluirMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: m } = await supabaseAdmin
      .from("materiais")
      .select("arquivo_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!m) throw new Error("Material não encontrado.");
    await supabaseAdmin.storage.from(BUCKET_MATERIAIS).remove([m.arquivo_path]);
    const { error } = await supabaseAdmin.from("materiais").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
