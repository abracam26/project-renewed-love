import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ehAdmin, exigirAdmin, tokenSchema, usuarioLogado } from "@/lib/auth-servidor";
import { acessoAtivo } from "@/lib/planos";

/**
 * Preço e descrição dos planos (editáveis pelo admin) e a situação do
 * aluno, para a página Planos. Guardado em configuracoes.planos_info.
 */

const CHAVE = "planos_info";

const infoPlanoSchema = z.object({
  preco: z.string().trim().max(60, "Preço muito longo.").default(""),
  descricao: z.string().trim().max(300, "Descrição muito longa.").default(""),
});
const planosInfoSchema = z.object({
  mensal: infoPlanoSchema.default({}),
  anual: infoPlanoSchema.default({}),
});
export type PlanosInfo = z.infer<typeof planosInfoSchema>;

function lerInfo(valor: string | null | undefined): PlanosInfo {
  try {
    return planosInfoSchema.parse(JSON.parse(valor ?? "{}"));
  } catch {
    return planosInfoSchema.parse({});
  }
}

export const obterPlanosInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const [{ data: cfg }, { data: perfil }, admin] = await Promise.all([
      supabaseAdmin.from("configuracoes").select("valor").eq("chave", CHAVE).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("plano, plano_validade, cpf_hash")
        .eq("id", user.id)
        .maybeSingle(),
      ehAdmin(supabaseAdmin, user.id),
    ]);

    let gratuidadeUsada = false;
    if (perfil?.cpf_hash) {
      const { data: usada } = await supabaseAdmin
        .from("gratuidade_usada")
        .select("usada_em")
        .eq("cpf_hash", perfil.cpf_hash)
        .maybeSingle();
      gratuidadeUsada = Boolean(usada);
    }

    return {
      info: lerInfo(cfg?.valor),
      atual: {
        plano: perfil?.plano ?? "gratis",
        planoValidade: perfil?.plano_validade ?? null,
        acessoAtivo: acessoAtivo(perfil?.plano, perfil?.plano_validade),
        isAdmin: admin,
        gratuidadeUsada,
      },
    };
  });

export const salvarPlanosInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => planosInfoSchema.extend({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin.from("configuracoes").upsert({
      chave: CHAVE,
      valor: JSON.stringify({ mensal: data.mensal, anual: data.anual }),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
