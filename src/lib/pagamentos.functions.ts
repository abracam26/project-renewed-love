import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ehAdmin,
  exigirAdmin,
  tokenSchema,
  usuarioLogado,
  type SupabaseAdmin,
} from "@/lib/auth-servidor";
import type { Json } from "@/integrations/supabase/types";
import { associadoVigente } from "@/lib/associados.functions";
import {
  FILTROS_PEDIDO,
  FORMAS_MANUAIS,
  FORMAS_PAGAMENTO,
  GATEWAYS,
  MAX_SIMULADOS_PACOTE,
  METODOS_PAGAMENTO,
  METODO_PAGAMENTO_LABEL,
  STATUS_PEDIDO,
  TIPOS_ACESSO,
  UNIDADES_DURACAO,
  mascararDocumento,
  type FormaManual,
  type MetodoPagamento,
  type StatusPagamento,
  type StatusPedido,
} from "@/lib/pagamentos";
import { acessoAtivo, hojeSaoPaulo } from "@/lib/planos";
import type { PixGerado } from "@/lib/pagarme.server";

/**
 * Planos à venda, pedidos e pagamentos.
 * Gateway "manual": o aluno paga por fora e o admin confirma.
 * Gateway "pagarme": o aluno é redirecionado ao checkout do Pagar.me;
 * a confirmação vem pelo polling do frontend ou pelo webhook (Edge Function).
 */

const CHAVE_CONFIG = "pagamento_config";
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const centavosSchema = z
  .number({ invalid_type_error: "Informe o valor." })
  .int("Valor inválido.")
  .positive("O valor precisa ser maior que zero.")
  .max(100000000, "Valor muito alto.");

// ---------------------------------------------------------------------
// Configuração do pagamento (configuracoes.pagamento_config)
// ---------------------------------------------------------------------
const configLeitura = z.object({
  gateway: z.enum(GATEWAYS).catch("manual"),
  prazo_pedido_dias: z.number().int().min(0).max(30).catch(3),
  formas_manual: z.array(z.enum(FORMAS_MANUAIS)).min(1).catch(["pix"]),
  formas_online: z.array(z.enum(FORMAS_PAGAMENTO)).catch(["pix", "cartao"]),
  instrucoes: z.record(z.string()).catch({}),
  pagarme: z.object({ chave_publica: z.string().catch("") }).catch({ chave_publica: "" }),
});
export type ConfigPagamento = {
  gateway: (typeof GATEWAYS)[number];
  prazoPedidoDias: number;
  formasManual: FormaManual[];
  formasOnline: (typeof FORMAS_PAGAMENTO)[number][];
  instrucoes: Partial<Record<FormaManual, string>>;
  pagarmeChavePublica: string;
};

function lerConfig(valor: string | null | undefined): ConfigPagamento {
  let bruto: unknown = {};
  try {
    bruto = JSON.parse(valor ?? "{}");
  } catch {
    bruto = {};
  }
  const c = configLeitura.parse(bruto && typeof bruto === "object" ? bruto : {});
  const instrucoes: Partial<Record<FormaManual, string>> = {};
  for (const f of FORMAS_MANUAIS) {
    const t = c.instrucoes[f];
    if (typeof t === "string" && t.trim()) instrucoes[f] = t.trim();
  }
  return {
    gateway: c.gateway,
    prazoPedidoDias: c.prazo_pedido_dias,
    formasManual: [...new Set(c.formas_manual)],
    formasOnline: [...new Set(c.formas_online)] as (typeof FORMAS_PAGAMENTO)[number][],
    instrucoes,
    pagarmeChavePublica: c.pagarme.chave_publica.trim(),
  };
}

async function carregarConfig(supabaseAdmin: SupabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from("configuracoes")
    .select("valor")
    .eq("chave", CHAVE_CONFIG)
    .maybeSingle();
  // Falha de leitura não pode virar "configuração padrão" (o admin salvaria por cima)
  if (error) {
    throw new Error("Não foi possível carregar a configuração de pagamento. Tente novamente.");
  }
  return lerConfig(data?.valor);
}

/** A chave secreta do Pagar.me fica só no servidor (variável de ambiente). */
function statusChaveSecreta() {
  const chave = process.env["PAGARME_SECRET_KEY"]?.trim() ?? "";
  if (!chave) return { configurada: false, modo: null, final: null };
  return {
    configurada: true,
    modo: chave.startsWith("sk_test_") ? ("teste" as const) : ("producao" as const),
    // Só os 4 últimos caracteres: confirma qual chave está no servidor sem expô-la
    final: chave.slice(-4),
  };
}

function erroRpc(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "40P01" || error.code === "40001") {
    throw new Error(
      "Outra operação estava alterando este pedido ou aluno ao mesmo tempo. Tente de novo.",
    );
  }
  throw new Error(error.message);
}

/** Data do pagamento informada pelo admin: hoje = agora; dia anterior = meio-dia em São Paulo. */
function momentoDoPagamento(data: string) {
  const hoje = hojeSaoPaulo();
  if (data > hoje) throw new Error("A data do pagamento não pode ser no futuro.");
  if (data < "2024-01-01") throw new Error("Data do pagamento inválida.");
  return data === hoje ? new Date().toISOString() : `${data}T12:00:00-03:00`;
}

type PedidoLinha = {
  id: string;
  codigo: string;
  status: string;
  valor_total: number;
  plano_nome: string;
  plano_tipo_acesso: string;
  plano_duracao_quantidade: number;
  plano_duracao_unidade: string;
  metodo_pagamento: string | null;
  gateway: string;
  origem: string;
  teste: boolean;
  created_at: string;
  expira_em: string | null;
  liberado_em: string | null;
  plano_id: string;
  plano_anterior: string | null;
  plano_nome_anterior: string | null;
  plano_concedido: string | null;
  chave_venda: string | null;
  validade_anterior: string | null;
  validade_concedida: string | null;
  dias_concedidos: number | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
  acesso_removido: boolean | null;
  comprador_nome: string;
  comprador_email: string | null;
  comprador_documento: string;
  comprador_tipo: string;
  user_id: string | null;
  desconto_associado: boolean;
  valor_sem_desconto: number | null;
  plano_quantidade_simulados: number | null;
  creditos_concedidos: number | null;
  creditos_removidos: number | null;
};

const CAMPOS_PEDIDO =
  "id, codigo, status, valor_total, plano_nome, plano_tipo_acesso, plano_duracao_quantidade, plano_duracao_unidade, metodo_pagamento, gateway, origem, teste, created_at, expira_em, liberado_em, plano_id, plano_anterior, plano_nome_anterior, plano_concedido, chave_venda, validade_anterior, validade_concedida, dias_concedidos, cancelado_em, motivo_cancelamento, estornado_em, motivo_estorno, acesso_removido, comprador_nome, comprador_email, comprador_documento, comprador_tipo, user_id, desconto_associado, valor_sem_desconto, plano_quantidade_simulados, creditos_concedidos, creditos_removidos";

function pedidoBasico(p: PedidoLinha) {
  return {
    id: p.id,
    codigo: p.codigo,
    status: p.status as StatusPedido,
    valorTotal: p.valor_total,
    planoId: p.plano_id,
    planoNome: p.plano_nome,
    planoTipoAcesso: p.plano_tipo_acesso,
    /** Pacote: quantos simulados o pedido dá (null nos planos por tempo) */
    quantidadeSimulados: p.plano_quantidade_simulados,
    duracaoQuantidade: p.plano_duracao_quantidade,
    duracaoUnidade: p.plano_duracao_unidade as "dias" | "meses",
    metodo: (p.metodo_pagamento ?? null) as MetodoPagamento | null,
    criadoEm: p.created_at,
    expiraEm: p.expira_em,
    liberadoEm: p.liberado_em,
    validadeConcedida: p.validade_concedida,
    canceladoEm: p.cancelado_em,
    motivoCancelamento: p.motivo_cancelamento,
    compradorTipo: p.comprador_tipo as "cpf" | "cnpj",
    /** Pedido com preço de associado ABRACAM (valorSemDesconto = preço normal na época) */
    descontoAssociado: p.desconto_associado,
    valorSemDesconto: p.valor_sem_desconto,
    /** Pacote pago: simulados somados ao saldo; estornado: quantos foram tirados */
    creditosConcedidos: p.creditos_concedidos,
    creditosRemovidos: p.creditos_removidos,
  };
}

// ---------------------------------------------------------------------
// Aluno: página Planos
// ---------------------------------------------------------------------
export const planosParaAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    // Pendentes com prazo vencido deste aluno viram "Prazo vencido"
    const { error: eExp } = await supabaseAdmin.rpc("expirar_pedidos_vencidos", {
      p_user: user.id,
    });
    erroRpc(eExp);
    // Associado ABRACAM: confere o vínculo antes de mostrar os preços
    const associado = await associadoVigente(supabaseAdmin, user.id, user.email);

    const [
      { data: perfil, error: ePerfil },
      admin,
      { data: planos, error: ePlanos },
      config,
      { data: pedidos, error: ePedidos },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "plano, plano_validade, plano_nome, cpf, cpf_hash, cnpj, instituicao, cadastro_completo_em, creditos_simulados, telefone",
        )
        .eq("id", user.id)
        .maybeSingle(),
      ehAdmin(supabaseAdmin, user.id),
      supabaseAdmin
        .from("planos")
        .select(
          "id, nome, descricao, beneficios, tipo_acesso, duracao_quantidade, duracao_unidade, quantidade_simulados, preco_centavos, preco_associado_centavos, destaque, ordem",
        )
        .eq("ativo", true)
        .order("ordem")
        .order("preco_centavos"),
      carregarConfig(supabaseAdmin),
      supabaseAdmin
        .from("pedidos")
        .select(CAMPOS_PEDIDO)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (ePerfil) throw new Error(ePerfil.message);
    if (ePlanos) throw new Error(ePlanos.message);
    if (ePedidos) throw new Error(ePedidos.message);

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
      planos: (planos ?? []).map((p) => {
        const comDesconto = associado !== null && p.preco_associado_centavos !== null;
        return {
          id: p.id,
          nome: p.nome,
          descricao: p.descricao,
          beneficios: p.beneficios,
          tipoAcesso: p.tipo_acesso,
          duracaoQuantidade: p.duracao_quantidade,
          duracaoUnidade: p.duracao_unidade as "dias" | "meses",
          quantidadeSimulados: p.quantidade_simulados,
          /** O que este aluno paga (preço de associado, quando vale) */
          precoCentavos:
            comDesconto && p.preco_associado_centavos !== null
              ? p.preco_associado_centavos
              : p.preco_centavos,
          precoNormalCentavos: p.preco_centavos,
          precoAssociadoCentavos: p.preco_associado_centavos,
          descontoAssociado: comDesconto,
          destaque: p.destaque,
        };
      }),
      atual: {
        plano: perfil?.plano ?? "gratis",
        planoNome: perfil?.plano_nome ?? null,
        planoValidade: perfil?.plano_validade ?? null,
        acessoAtivo: acessoAtivo(perfil?.plano, perfil?.plano_validade),
        bloqueado: perfil?.plano === "inativo",
        cadastroCompleto: Boolean(perfil?.cadastro_completo_em && perfil?.cpf),
        isAdmin: admin,
        gratuidadeUsada,
        /** Instituição associada (desconto valendo), ou null */
        associado: associado ? { nome: associado.nome } : null,
        /** Saldo de simulados dos pacotes */
        creditos: perfil?.creditos_simulados ?? 0,
      },
      comprador: {
        cpf: mascararDocumento(perfil?.cpf),
        cnpj: perfil?.cnpj ? mascararDocumento(perfil.cnpj) : null,
        empresa: perfil?.instituicao ?? null,
        telefone: perfil?.telefone ?? null,
      },
      gateway: config.gateway,
      formas: config.formasManual.map((f) => ({
        metodo: f,
        rotulo: METODO_PAGAMENTO_LABEL[f],
        instrucoes: config.instrucoes[f] ?? "",
      })),
      prazoDias: config.prazoPedidoDias,
      pedidos: ((pedidos ?? []) as unknown as PedidoLinha[]).map((p) => ({
        ...pedidoBasico(p),
        /** O documento do pedido é o mesmo do cadastro hoje (regra de reaproveitar o pendente) */
        documentoConfere:
          p.comprador_documento === (p.comprador_tipo === "cnpj" ? perfil?.cnpj : perfil?.cpf),
      })),
    };
  });

export const criarPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        planoId: z.string().uuid("Plano inválido."),
        metodo: z.enum(FORMAS_MANUAIS, {
          errorMap: () => ({ message: "Escolha a forma de pagamento." }),
        }),
        comprador: z.enum(["cpf", "cnpj"]).default("cpf"),
        /** Celular com DDD (pagamento online por Pix) */
        telefone: z
          .string()
          .transform((t) => t.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))
          .refine((t) => /^[1-9]{2}9?\d{8}$/.test(t), "Celular inválido: informe DDD e número.")
          .nullable()
          .default(null),
        /** O que a página mostrava: código do pedido pendente (ou null) e se ele seria mantido */
        pendenteEsperado: z.string().max(40).nullable().default(null),
        manterEsperado: z.boolean().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const config = await carregarConfig(supabaseAdmin);
    if (!config.formasManual.includes(data.metodo)) {
      throw new Error("Esta forma de pagamento não está disponível no momento.");
    }
    // O banco aplica o preço de associado pelo vínculo do perfil; aqui ele é conferido antes
    await associadoVigente(supabaseAdmin, user.id, user.email);
    const { data: r, error } = await supabaseAdmin.rpc("criar_pedido", {
      p_user: user.id,
      p_plano: data.planoId,
      p_metodo: data.metodo,
      p_comprador_tipo: data.comprador,
      p_origem: "aluno",
      p_por: user.id,
      p_prazo_dias: config.prazoPedidoDias,
      ...(data.pendenteEsperado ? { p_pendente_esperado: data.pendenteEsperado } : {}),
      ...(data.manterEsperado !== null ? { p_manter_esperado: data.manterEsperado } : {}),
    });
    erroRpc(error);
    const res = r as { pedido_id: string; codigo: string; reaproveitado: boolean };

    const online = config.gateway === "pagarme" && data.metodo === "pix";
    if (online) {
      if (!data.telefone) throw new Error("Informe seu celular com DDD para pagar com Pix.");
      const { error: eTel } = await supabaseAdmin
        .from("profiles")
        .update({ telefone: data.telefone })
        .eq("id", user.id);
      if (eTel) throw new Error(eTel.message);
    }
    const pix = online
      ? await pixDoPedido(supabaseAdmin, res.pedido_id, user.id, user.email ?? null)
      : null;

    return {
      pedidoId: res.pedido_id,
      codigo: res.codigo,
      reaproveitado: res.reaproveitado,
      pix,
    };
  });

/** Pix do pedido no Pagar.me: reaproveita a ordem já criada ou gera uma nova. */
async function pixDoPedido(
  supabaseAdmin: SupabaseAdmin,
  pedidoId: string,
  userId: string,
  emailUsuario: string | null,
): Promise<PixGerado> {
  const { data: p, error } = await supabaseAdmin
    .from("pedidos")
    .select(
      "id, codigo, status, user_id, external_order_id, plano_nome, valor_total, comprador_nome, comprador_documento, comprador_email, comprador_tipo, expira_em",
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!p || p.user_id !== userId) throw new Error("Pedido não encontrado.");
  if (p.status !== "pendente") throw new Error("Este pedido não está aguardando pagamento.");

  const { data: perfil, error: ePerfil } = await supabaseAdmin
    .from("profiles")
    .select("telefone")
    .eq("id", userId)
    .maybeSingle();
  if (ePerfil) throw new Error(ePerfil.message);
  const telefone = perfil?.telefone ?? "";
  if (!telefone)
    throw new Error("Informe seu celular com DDD para pagar com Pix: faça o pedido de novo.");

  const { consultarOrdemPagarme, criarOrdemPix, extrairPix } = await import("@/lib/pagarme.server");
  if (p.external_order_id) {
    const ordem = await consultarOrdemPagarme(p.external_order_id);
    const existente = extrairPix(ordem);
    const vencido = existente?.expiraEm && new Date(existente.expiraEm) <= new Date();
    if (ordem.status === "pending" && existente && !vencido) {
      return { ordemId: ordem.id, ...existente };
    }
  }

  const segundosAtePrazo = p.expira_em
    ? Math.floor((new Date(p.expira_em).getTime() - Date.now()) / 1000)
    : 3 * 86400;
  return criarOrdemPix(supabaseAdmin, {
    pedidoId: p.id,
    codigo: p.codigo,
    planoNome: p.plano_nome,
    valorCentavos: p.valor_total,
    compradorNome: p.comprador_nome,
    compradorEmail: p.comprador_email ?? emailUsuario ?? "",
    compradorDocumento: p.comprador_documento,
    compradorTipo: p.comprador_tipo === "cnpj" ? "cnpj" : "cpf",
    compradorTelefone: telefone,
    expiracaoSegundos: Math.max(600, Math.min(segundosAtePrazo, 30 * 86400)),
  });
}

export const obterPixPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, pedidoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const config = await carregarConfig(supabaseAdmin);
    if (config.gateway !== "pagarme") throw new Error("O pagamento online não está ativo.");
    return pixDoPedido(supabaseAdmin, data.pedidoId, user.id, user.email ?? null);
  });

export const cancelarMeuPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, pedidoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const { error } = await supabaseAdmin.rpc("cancelar_pedido", {
      p_pedido: data.pedidoId,
      p_por: user.id,
      p_dono: user.id,
    });
    erroRpc(error);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Admin: catálogo de planos
// ---------------------------------------------------------------------
export const listarPlanosAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: planos, error } = await supabaseAdmin
      .from("planos")
      .select("*")
      .order("ordem")
      .order("created_at");
    if (error) throw new Error(error.message);
    const usos = await Promise.all(
      (planos ?? []).map(async (p) => {
        const { count, error: e } = await supabaseAdmin
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("plano_id", p.id);
        if (e) throw new Error(e.message);
        return [p.id, (count ?? 0) > 0] as const;
      }),
    );
    const comPedido = new Set(usos.filter(([, tem]) => tem).map(([id]) => id));
    return {
      planos: (planos ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        beneficios: p.beneficios,
        tipoAcesso: p.tipo_acesso as (typeof TIPOS_ACESSO)[number],
        quantidadeSimulados: p.quantidade_simulados,
        duracaoQuantidade: p.duracao_quantidade,
        duracaoUnidade: p.duracao_unidade as "dias" | "meses",
        precoCentavos: p.preco_centavos,
        precoAssociadoCentavos: p.preco_associado_centavos,
        formasPagamento: p.formas_pagamento as (typeof FORMAS_PAGAMENTO)[number][],
        parcelasMax: p.parcelas_max,
        destaque: p.destaque,
        ordem: p.ordem,
        ativo: p.ativo,
        temPedidos: comPedido.has(p.id),
      })),
    };
  });

const planoSchema = z
  .object({
    token: tokenSchema,
    id: z.string().uuid().nullable().default(null),
    nome: z
      .string()
      .trim()
      .min(3, "O nome precisa ter pelo menos 3 letras.")
      .max(60, "Nome muito longo."),
    descricao: z.string().trim().max(300, "Descrição muito longa.").default(""),
    beneficios: z
      .array(z.string().trim().min(1).max(150, "Cada benefício pode ter até 150 caracteres."))
      .max(12, "No máximo 12 benefícios.")
      .default([]),
    tipoAcesso: z.enum(TIPOS_ACESSO),
    /** Pacote: quantos simulados o aluno ganha (null nos planos por tempo) */
    quantidadeSimulados: z
      .number()
      .int("Quantidade de simulados inválida.")
      .nullable()
      .default(null),
    duracaoQuantidade: z.number().int("Duração inválida.").min(1, "Duração inválida."),
    duracaoUnidade: z.enum(UNIDADES_DURACAO),
    precoCentavos: z.number().int().min(0).max(100000000, "Preço muito alto."),
    /** Preço para associados ABRACAM (null = sem preço especial) */
    precoAssociadoCentavos: z
      .number()
      .int("Preço para associados inválido.")
      .positive("O preço para associados precisa ser maior que zero.")
      .nullable()
      .default(null),
    formasPagamento: z
      .array(z.enum(FORMAS_PAGAMENTO))
      .min(1, "Marque pelo menos uma forma de pagamento."),
    parcelasMax: z.number().int().min(1).max(12),
    destaque: z.boolean().default(false),
    ordem: z.number().int().min(0).max(999).default(0),
    ativo: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.tipoAcesso === "pacote") {
      const q = v.quantidadeSimulados;
      if (q === null || q < 1 || q > MAX_SIMULADOS_PACOTE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantidadeSimulados"],
          message: `Informe quantos simulados o pacote tem (de 1 a ${MAX_SIMULADOS_PACOTE}).`,
        });
      }
    }
    const max = v.duracaoUnidade === "meses" ? 120 : 3660;
    if (v.tipoAcesso !== "pacote" && v.duracaoQuantidade > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duracaoQuantidade"],
        message: `Duração máxima: ${max} ${v.duracaoUnidade}.`,
      });
    }
    if (v.ativo && v.precoCentavos <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["precoCentavos"],
        message: "Defina o preço antes de ativar o plano.",
      });
    }
    if (v.precoAssociadoCentavos !== null && v.precoAssociadoCentavos > v.precoCentavos) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["precoAssociadoCentavos"],
        message: "O preço para associados não pode ser maior que o preço normal.",
      });
    }
  });

export const salvarPlano = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => planoSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const pacote = data.tipoAcesso === "pacote";
    const row = {
      nome: data.nome,
      descricao: data.descricao,
      beneficios: data.beneficios,
      tipo_acesso: data.tipoAcesso,
      quantidade_simulados: pacote ? data.quantidadeSimulados : null,
      // No pacote a duração não se aplica (o saldo não vence): grava um valor fixo
      duracao_quantidade: pacote ? 1 : data.duracaoQuantidade,
      duracao_unidade: pacote ? "meses" : data.duracaoUnidade,
      preco_centavos: data.precoCentavos,
      preco_associado_centavos: data.precoAssociadoCentavos,
      formas_pagamento: [...new Set(data.formasPagamento)],
      parcelas_max: data.parcelasMax,
      destaque: data.destaque,
      ordem: data.ordem,
      ativo: data.ativo,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("planos").update(row).eq("id", data.id)
      : await supabaseAdmin.from("planos").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const excluirPlano = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { count } = await supabaseAdmin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("plano_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Este plano já tem pedidos e não pode ser excluído. Desative-o.");
    }
    const { error } = await supabaseAdmin.from("planos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Admin: configuração do pagamento
// ---------------------------------------------------------------------
export const obterConfigPagamento = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const config = await carregarConfig(supabaseAdmin);
    const secreta = statusChaveSecreta();
    const pub = config.pagarmeChavePublica;
    return {
      config,
      pagarme: {
        chaveSecretaConfigurada: secreta.configurada,
        modoChaveSecreta: secreta.modo,
        finalChaveSecreta: secreta.final,
        modoChavePublica: pub ? (pub.startsWith("pk_test_") ? "teste" : "producao") : null,
      },
    };
  });

export const salvarConfigPagamento = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        gateway: z.enum(GATEWAYS),
        prazoPedidoDias: z
          .number()
          .int()
          .min(0, "Prazo inválido.")
          .max(30, "O prazo máximo é de 30 dias."),
        formasManual: z
          .array(z.enum(FORMAS_MANUAIS))
          .min(1, "Marque pelo menos uma forma de pagamento."),
        instrucoes: z.record(z.string().trim().max(1500, "Instrução muito longa.")).default({}),
        pagarmeChavePublica: z
          .string()
          .trim()
          .max(200)
          .regex(/^(pk_(test_)?[A-Za-z0-9]+)?$/, "A chave pública do Pagar.me começa com pk_.")
          .default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    if (data.gateway === "pagarme") {
      const chave = process.env["PAGARME_SECRET_KEY"]?.trim();
      if (!chave) {
        throw new Error(
          "A chave secreta do Pagar.me (PAGARME_SECRET_KEY) não está configurada no servidor.",
        );
      }
      if (!data.pagarmeChavePublica.trim()) {
        throw new Error(
          "A chave pública do Pagar.me precisa ser informada antes de ativar o pagamento online.",
        );
      }
    }
    const instrucoes: Record<string, string> = {};
    for (const f of FORMAS_MANUAIS) {
      const t = data.instrucoes[f];
      if (t) instrucoes[f] = t;
    }
    const valor = JSON.stringify({
      gateway: data.gateway,
      prazo_pedido_dias: data.prazoPedidoDias,
      formas_manual: [...new Set(data.formasManual)],
      formas_online: data.gateway === "pagarme" ? ["pix", "cartao"] : [],
      instrucoes,
      pagarme: { chave_publica: data.pagarmeChavePublica },
    });
    const { error } = await supabaseAdmin.from("configuracoes").upsert(
      {
        chave: CHAVE_CONFIG,
        valor,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chave" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Aluno: verificar pagamento Pagar.me (polling do frontend)
// ---------------------------------------------------------------------
export const verificarPagamentoPagarme = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, pedidoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const { data: pedido, error } = await supabaseAdmin
      .from("pedidos")
      .select("id, status, external_order_id, user_id")
      .eq("id", data.pedidoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pedido) throw new Error("Pedido não encontrado.");
    if (pedido.user_id !== user.id) throw new Error("Pedido não encontrado.");
    if (pedido.status === "pago") return { status: "pago" as const };
    if (pedido.status !== "pendente")
      return { status: pedido.status as "cancelado" | "expirado" | "estornado" };
    if (!pedido.external_order_id) return { status: "pendente" as const };

    try {
      const { consultarOrdemPagarme, processarPagamentoConfirmado } =
        await import("@/lib/pagarme.server");
      const ordem = await consultarOrdemPagarme(pedido.external_order_id);
      if (ordem.status === "paid") {
        await processarPagamentoConfirmado(supabaseAdmin, pedido.id, ordem);
        return { status: "pago" as const };
      }
      if (ordem.status === "canceled" || ordem.status === "failed") {
        return { status: "falhou" as const };
      }
      return { status: "pendente" as const };
    } catch (e) {
      console.error("[Pagar.me] Erro ao verificar:", e);
      return { status: "pendente" as const };
    }
  });

// ---------------------------------------------------------------------
// Admin: pedidos
// ---------------------------------------------------------------------
const POR_PAGINA = 30;

export type PedidoAdmin = Awaited<ReturnType<typeof montarPedidosAdmin>>[number];

async function montarPedidosAdmin(supabaseAdmin: SupabaseAdmin, linhas: PedidoLinha[]) {
  const ids = linhas.map((p) => p.id);
  const usuarios = [...new Set(linhas.map((p) => p.user_id).filter((x): x is string => !!x))];
  const [pagsRes, perfisRes, pendRes] = await Promise.all([
    ids.length
      ? supabaseAdmin
          .from("pagamentos")
          .select(
            "id, pedido_id, gateway, metodo_pagamento, valor, status, paid_at, created_at, requer_revisao, motivo_revisao, metadata",
          )
          .in("pedido_id", ids)
          .order("created_at")
      : null,
    usuarios.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, plano, plano_validade, plano_nome, creditos_simulados")
          .in("id", usuarios)
      : null,
    // Pedido do mesmo aluno aguardando pagamento (aviso ao confirmar outro pedido)
    usuarios.length
      ? supabaseAdmin
          .from("pedidos")
          .select("id, user_id, codigo")
          .eq("status", "pendente")
          .in("user_id", usuarios)
      : null,
  ]);
  if (pagsRes?.error) throw new Error(pagsRes.error.message);
  if (perfisRes?.error) throw new Error(perfisRes.error.message);
  if (pendRes?.error) throw new Error(pendRes.error.message);
  const pags = pagsRes?.data ?? [];
  const perfilPor = new Map((perfisRes?.data ?? []).map((p) => [p.id, p]));
  const pendentes = pendRes?.data ?? [];

  return linhas.map((p) => {
    const pagamentos = pags
      .filter((g) => g.pedido_id === p.id)
      .map((g) => {
        const meta = (g.metadata ?? {}) as Record<string, unknown>;
        return {
          id: g.id,
          gateway: g.gateway,
          metodo: g.metodo_pagamento as MetodoPagamento,
          valor: g.valor,
          status: g.status as StatusPagamento,
          pagoEm: g.paid_at,
          criadoEm: g.created_at,
          requerRevisao: g.requer_revisao,
          motivoRevisao: g.motivo_revisao,
          observacao:
            typeof meta["observacao"] === "string" ? (meta["observacao"] as string) : null,
        };
      });
    const perfil = p.user_id ? perfilPor.get(p.user_id) : undefined;
    if (p.user_id && !perfil) {
      throw new Error(`O perfil do aluno do pedido ${p.codigo} não foi encontrado.`);
    }
    const outroPendente = pendentes.find((x) => x.user_id === p.user_id && x.id !== p.id);
    return {
      ...pedidoBasico(p),
      origem: p.origem as "aluno" | "admin",
      teste: p.teste,
      gateway: p.gateway,
      planoAnterior: p.plano_anterior,
      planoNomeAnterior: p.plano_nome_anterior,
      planoConcedido: p.plano_concedido,
      /** Chave da venda registrada pelo admin (a tela descarta a chave guardada que já foi usada) */
      chaveVenda: p.chave_venda,
      validadeAnterior: p.validade_anterior,
      diasConcedidos: p.dias_concedidos,
      estornadoEm: p.estornado_em,
      motivoEstorno: p.motivo_estorno,
      acessoRemovido: p.acesso_removido,
      comprador: {
        nome: p.comprador_nome,
        email: p.comprador_email,
        documento: mascararDocumento(p.comprador_documento),
        tipo: p.comprador_tipo as "cpf" | "cnpj",
      },
      /** null = a conta do aluno foi excluída */
      userId: p.user_id,
      perfil: perfil
        ? {
            plano: perfil.plano,
            planoValidade: perfil.plano_validade,
            planoNome: perfil.plano_nome,
            creditos: perfil.creditos_simulados,
          }
        : null,
      /** Código de outro pedido do mesmo aluno aguardando pagamento (se houver) */
      outroPendente: outroPendente?.codigo ?? null,
      pagamentos,
      precisaRevisao: pagamentos.some((g) => g.requerRevisao),
    };
  });
}

export const listarPedidos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        filtro: z.enum(FILTROS_PEDIDO).default("pendente"),
        busca: z.string().trim().max(100).default(""),
        pagina: z.number().int().min(1).max(1000).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error: eExp } = await supabaseAdmin.rpc("expirar_pedidos_vencidos", {});
    erroRpc(eExp);

    const contar = (status: StatusPedido[]) =>
      supabaseAdmin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .in("status", status);
    const [c1, c2, c3, c4, rev] = await Promise.all([
      contar(["pendente"]),
      contar(["pago"]),
      contar(["cancelado", "expirado"]),
      contar(["estornado"]),
      supabaseAdmin.from("pagamentos").select("pedido_id").eq("requer_revisao", true).limit(1000),
    ]);
    for (const r of [c1, c2, c3, c4, rev]) {
      if (r.error) throw new Error(r.error.message);
    }
    const idsRevisao = [...new Set((rev.data ?? []).map((r) => r.pedido_id))];

    // Busca por código, nome ou e-mail (sem caracteres que quebram o filtro)
    const busca = data.busca.replace(/[,()%*\\]/g, " ").trim();
    const montarConsulta = (colunas: string, soContar: boolean) => {
      let q = supabaseAdmin.from("pedidos").select(colunas, { count: "exact", head: soContar });
      if (data.filtro === "revisao") {
        q = q.in("id", idsRevisao.length ? idsRevisao : ["00000000-0000-0000-0000-000000000000"]);
      } else if (data.filtro === "cancelado") {
        q = q.in("status", ["cancelado", "expirado"]);
      } else if (data.filtro !== "todos") {
        q = q.eq("status", data.filtro);
      }
      if (busca) {
        q = q.or(
          `codigo.ilike.%${busca}%,comprador_nome.ilike.%${busca}%,comprador_email.ilike.%${busca}%`,
        );
      }
      return q;
    };

    const inicio = (data.pagina - 1) * POR_PAGINA;
    const res = await montarConsulta(CAMPOS_PEDIDO, false)
      .order("created_at", { ascending: false })
      .range(inicio, inicio + POR_PAGINA - 1);
    let linhas = (res.data ?? []) as unknown as PedidoLinha[];
    let total = res.count ?? 0;
    if (res.error) {
      // Página além do total (a lista encolheu): devolve vazia com o total atual
      if (res.error.code !== "PGRST103") throw new Error(res.error.message);
      const c = await montarConsulta("id", true);
      if (c.error) throw new Error(c.error.message);
      linhas = [];
      total = c.count ?? 0;
    }

    return {
      pedidos: await montarPedidosAdmin(supabaseAdmin, linhas),
      total,
      porPagina: POR_PAGINA,
      totais: {
        pendente: c1.count ?? 0,
        pago: c2.count ?? 0,
        cancelado: c3.count ?? 0,
        estornado: c4.count ?? 0,
        revisao: idsRevisao.length,
      },
    };
  });

export type ResultadoPagamento = {
  situacao: "liberado" | "revisao" | "ja_registrado";
  validade?: string;
  plano?: string;
  dias?: number;
  /** Pacote: simulados somados e saldo depois */
  creditos?: number;
  saldo?: number;
  alerta?: string | null;
  pedidos_cancelados?: string[];
  codigo?: string;
};

export const confirmarPagamento = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        pedidoId: z.string().uuid(),
        /** Liberar com um pagamento já recebido que está em revisão (não grava outro) */
        pagamentoId: z.string().uuid().nullable().default(null),
        metodo: z.enum(METODOS_PAGAMENTO),
        valorCentavos: centavosSchema,
        data: dataSchema,
        observacao: z.string().trim().max(500, "Observação muito longa.").default(""),
        aceitarValorDiferente: z.boolean().default(false),
      })
      .superRefine((v, ctx) => {
        if (v.aceitarValorDiferente && v.observacao.length < 5) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["observacao"],
            message: "Explique na observação por que o valor recebido é diferente do pedido.",
          });
        }
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { data: r, error } = await supabaseAdmin.rpc("registrar_pagamento_pedido", {
      p_pedido: data.pedidoId,
      p_origem: "admin",
      p_por: user.id,
      p_gateway: "manual",
      p_metodo: data.metodo,
      p_valor: data.valorCentavos,
      p_pago_em: momentoDoPagamento(data.data),
      p_metadata: data.observacao ? { observacao: data.observacao } : {},
      p_aceitar_valor_diferente: data.aceitarValorDiferente,
      ...(data.pagamentoId ? { p_pagamento_id: data.pagamentoId } : {}),
    });
    erroRpc(error);
    return r as unknown as ResultadoPagamento;
  });

export const cancelarPedidoAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        pedidoId: z.string().uuid(),
        motivo: z.string().trim().max(500, "Motivo muito longo.").default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { error } = await supabaseAdmin.rpc("cancelar_pedido", {
      p_pedido: data.pedidoId,
      p_por: user.id,
      ...(data.motivo ? { p_motivo: data.motivo } : {}),
    });
    erroRpc(error);
    return { ok: true as const };
  });

export const estornarPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        pedidoId: z.string().uuid(),
        removerAcesso: z.boolean(),
        motivo: z
          .string()
          .trim()
          .min(3, "Informe o motivo do estorno.")
          .max(500, "Motivo muito longo."),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { data: r, error } = await supabaseAdmin.rpc("estornar_pedido", {
      p_pedido: data.pedidoId,
      p_por: user.id,
      p_remover_acesso: data.removerAcesso,
      p_motivo: data.motivo,
    });
    erroRpc(error);
    return r as unknown as {
      acesso_removido: boolean;
      /**
       * restaurado = voltou ao acesso de antes do pedido; dias = tirou só os dias não usados;
       * creditos = pacote: tirou do saldo os simulados não usados
       */
      modo: "restaurado" | "dias" | "creditos" | "nada";
      dias_nao_usados: number;
      creditos_removidos: number;
      plano: string | null;
      validade_anterior: string | null;
      validade: string | null;
    };
  });

export const resolverRevisao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        pagamentoId: z.string().uuid(),
        observacao: z
          .string()
          .trim()
          .min(3, "Descreva como foi resolvido (ex.: valor devolvido ao aluno).")
          .max(500, "Observação muito longa."),
        /** O valor foi devolvido ao aluno: o pagamento passa a estornado (sai da receita) */
        devolvido: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { data: r, error } = await supabaseAdmin.rpc("resolver_revisao_pagamento", {
      p_pagamento: data.pagamentoId,
      p_por: user.id,
      p_observacao: data.observacao,
      p_devolvido: data.devolvido,
    });
    erroRpc(error);
    return {
      ok: true as const,
      devolvido: Boolean((r as { devolvido?: boolean } | null)?.devolvido),
    };
  });

// ---------------------------------------------------------------------
// Admin: ficha do usuário (pedidos, histórico e venda feita por fora)
// ---------------------------------------------------------------------
export const pedidosDoUsuario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { error: eExp } = await supabaseAdmin.rpc("expirar_pedidos_vencidos", {
      p_user: data.userId,
    });
    erroRpc(eExp);
    const [
      { data: pedidos, error },
      { data: historico, error: eHist },
      { data: movimentos, error: eMov },
    ] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select(CAMPOS_PEDIDO)
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("historico_acesso")
        .select(
          "id, origem, plano_antes, validade_antes, plano_depois, validade_depois, observacao, created_at",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("movimentos_creditos")
        .select("id, quantidade, saldo_depois, origem, pedido_id, observacao, created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (error) throw new Error(error.message);
    if (eHist) throw new Error(eHist.message);
    if (eMov) throw new Error(eMov.message);
    const lista = (pedidos ?? []) as unknown as PedidoLinha[];
    return {
      pedidos: await montarPedidosAdmin(supabaseAdmin, lista),
      /** Código do pedido aguardando pagamento (a venda registrada vai substituí-lo) */
      pendenteCodigo: lista.find((p) => p.status === "pendente")?.codigo ?? null,
      historico: (historico ?? []).map((h) => ({
        id: h.id,
        origem: h.origem as "pedido" | "estorno" | "admin",
        planoAntes: h.plano_antes,
        validadeAntes: h.validade_antes,
        planoDepois: h.plano_depois,
        validadeDepois: h.validade_depois,
        observacao: h.observacao,
        criadoEm: h.created_at,
      })),
      /** Extrato do saldo de simulados (pacotes, uso, estornos e ajustes) */
      movimentos: (movimentos ?? []).map((m) => ({
        id: m.id,
        quantidade: m.quantidade,
        saldoDepois: m.saldo_depois,
        origem: m.origem as "pedido" | "estorno" | "simulado" | "admin",
        pedidoCodigo: lista.find((p) => p.id === m.pedido_id)?.codigo ?? null,
        observacao: m.observacao,
        criadoEm: m.created_at,
      })),
    };
  });

export const registrarVenda = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        userId: z.string().uuid(),
        planoId: z.string().uuid("Escolha o plano."),
        metodo: z.enum(METODOS_PAGAMENTO),
        valorCentavos: centavosSchema,
        data: dataSchema,
        comprador: z.enum(["cpf", "cnpj"]).default("cpf"),
        observacao: z.string().trim().max(500, "Observação muito longa.").default(""),
        /** Gerada ao abrir o diálogo; a mesma em cada nova tentativa (não registra duas vezes) */
        chave: z.string().uuid(),
        /** Código do pedido pendente que o admin viu na ficha (ou null) */
        pendenteEsperado: z.string().nullable().default(null),
        aceitarValorDiferente: z.boolean().default(false),
      })
      .superRefine((v, ctx) => {
        if (v.aceitarValorDiferente && v.observacao.length < 5) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["observacao"],
            message: "Explique na observação por que o valor é diferente do preço do plano.",
          });
        }
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await exigirAdmin(data.token);
    const { data: r, error } = await supabaseAdmin.rpc("registrar_venda_admin", {
      p_user: data.userId,
      p_plano: data.planoId,
      p_metodo: data.metodo,
      p_valor: data.valorCentavos,
      p_por: user.id,
      p_chave: data.chave,
      p_pago_em: momentoDoPagamento(data.data),
      p_comprador_tipo: data.comprador,
      p_metadata: data.observacao ? { observacao: data.observacao } : {},
      ...(data.pendenteEsperado ? { p_pendente_esperado: data.pendenteEsperado } : {}),
      p_aceitar_valor_diferente: data.aceitarValorDiferente,
    });
    erroRpc(error);
    return r as unknown as ResultadoPagamento;
  });
