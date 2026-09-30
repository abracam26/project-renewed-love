import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ehAdmin, tokenSchema, usuarioLogado, type SupabaseAdmin } from "@/lib/auth-servidor";
import {
  formatarDataBR,
  hojeSaoPaulo,
  nomeDoPlano,
  PLANOS_PAGOS,
  somarDias,
  type Plano,
} from "@/lib/planos";

/**
 * Notificações do sino (barra superior). A maior parte é gravada por
 * gatilhos no banco (chamados, reportes, pedidos e materiais — migração
 * 20260930120000_notificacoes.sql). Aqui ficam a lista, a marcação de
 * lidas e os avisos de boas-vindas e de plano perto de vencer, criados
 * na hora em que a lista é carregada.
 */

export type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida_em: string | null;
  created_at: string;
};

const CAMPOS = "id, tipo, titulo, mensagem, link, lida_em, created_at";
const LIMITE_LISTA = 30;
/** Aviso de "vence em breve" a partir de quantos dias antes. */
const DIAS_AVISO_VENCIMENTO = 7;
/** Por quantos dias depois de vencer ainda vale avisar. */
const DIAS_AVISO_VENCIDO = 30;

type AvisoNovo = {
  user_id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  ref: string;
};

async function gravarAvisos(supabaseAdmin: SupabaseAdmin, avisos: AvisoNovo[]) {
  if (avisos.length === 0) return;
  // O índice único (user_id, tipo, ref) impede avisos repetidos
  await supabaseAdmin
    .from("notificacoes")
    .upsert(avisos, { onConflict: "user_id,tipo,ref", ignoreDuplicates: true });
}

/** Avisos que dependem da data (plano vencendo ou vencido). */
async function avisosDoPlano(supabaseAdmin: SupabaseAdmin, userId: string): Promise<AvisoNovo[]> {
  const [{ data: perfil }, admin] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("plano, plano_nome, plano_validade")
      .eq("id", userId)
      .maybeSingle(),
    ehAdmin(supabaseAdmin, userId),
  ]);
  if (admin || !perfil?.plano_validade) return [];
  if (!PLANOS_PAGOS.includes(perfil.plano as Plano)) return [];

  const hoje = hojeSaoPaulo();
  const validade = perfil.plano_validade;
  const nome = nomeDoPlano(perfil.plano, perfil.plano_nome);

  if (validade >= hoje && validade <= somarDias(hoje, DIAS_AVISO_VENCIMENTO)) {
    return [
      {
        user_id: userId,
        tipo: "plano_vencendo",
        titulo: validade === hoje ? "Seu acesso vence hoje" : "Seu acesso vence em breve",
        mensagem: `O plano ${nome} dá acesso aos simulados completos até ${formatarDataBR(validade)}. Renove na página Planos para não perder o acesso.`,
        link: "/planos",
        ref: validade,
      },
    ];
  }
  if (validade < hoje && validade >= somarDias(hoje, -DIAS_AVISO_VENCIDO)) {
    return [
      {
        user_id: userId,
        tipo: "plano_vencido",
        titulo: "Seu acesso venceu",
        mensagem: `O acesso aos simulados completos terminou em ${formatarDataBR(validade)}. Contrate um novo plano na página Planos para continuar treinando.`,
        link: "/planos",
        ref: validade,
      },
    ];
  }
  return [];
}

async function buscarLista(supabaseAdmin: SupabaseAdmin, userId: string) {
  const [{ data: rows, error }, { count, error: eCount }] = await Promise.all([
    supabaseAdmin
      .from("notificacoes")
      .select(CAMPOS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIMITE_LISTA)
      .returns<Notificacao[]>(),
    supabaseAdmin
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("lida_em", null),
  ]);
  if (error) throw new Error(error.message);
  if (eCount) throw new Error(eCount.message);
  return { notificacoes: rows ?? [], naoLidas: count ?? 0 };
}

export const listarNotificacoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);

    // Avisos automáticos: uma falha aqui não impede de mostrar a lista
    try {
      await gravarAvisos(supabaseAdmin, await avisosDoPlano(supabaseAdmin, user.id));
    } catch {
      // segue sem o aviso de vencimento
    }

    let lista = await buscarLista(supabaseAdmin, user.id);
    if (lista.notificacoes.length === 0) {
      try {
        await gravarAvisos(supabaseAdmin, [
          {
            user_id: user.id,
            tipo: "boas_vindas",
            titulo: "Bem-vindo ao Simulador ABT",
            mensagem:
              "Aqui no sino aparecem os avisos sobre seus pedidos e pagamentos, chamados de suporte, reportes de questões, novos materiais e o vencimento do seu plano.",
            link: null,
            ref: "1",
          },
        ]);
        lista = await buscarLista(supabaseAdmin, user.id);
      } catch {
        // sem boas-vindas, a lista vazia continua valendo
      }
    }
    return lista;
  });

export const marcarNotificacoesLidas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        // Sem ids: marca todas as não lidas
        ids: z.array(z.string().uuid()).min(1).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    let consulta = supabaseAdmin
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("lida_em", null);
    if (data.ids) consulta = consulta.in("id", data.ids);
    const { error } = await consulta;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
