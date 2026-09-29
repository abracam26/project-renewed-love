import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ehAdmin,
  exigirAdmin,
  tokenSchema,
  usuarioLogado,
  type SupabaseAdmin,
} from "@/lib/auth-servidor";
import type { Json } from "@/integrations/supabase/types";
import {
  FILTROS_PEDIDO,
  FORMAS_MANUAIS,
  FORMAS_PAGAMENTO,
  GATEWAYS,
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

/**
 * O módulo de pagamentos é implantado por uma migration própria e pode estar
 * à frente do arquivo de tipos gerado. Mantém a checagem do restante do banco
 * sem bloquear a compilação enquanto esses tipos são sincronizados.
 */
function bancoPagamentos(client: SupabaseAdmin) {
  return client as unknown as SupabaseClient<any>;
}

/**
 * Planos à venda, pedidos e pagamentos (Etapa 1: o aluno faz o pedido e paga
 * por fora; o admin confirma o pagamento e o acesso é liberado na hora).
 * Tudo que mexe em dinheiro ou acesso passa pelas funções do banco
 * (criar_pedido, registrar_pagamento_pedido, cancelar_pedido,
 * estornar_pedido), que travam pedido e perfil. Os mesmos caminhos serão
 * usados pelo aviso do Pagar.me na Etapa 2.
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
  instrucoes: z.record(z.string()).catch({}),
  pagarme: z.object({ chave_publica: z.string().catch("") }).catch({ chave_publica: "" }),
});
export type ConfigPagamento = {
  gateway: (typeof GATEWAYS)[number];
  prazoPedidoDias: number;
  formasManual: FormaManual[];
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
    instrucoes,
    pagarmeChavePublica: c.pagarme.chave_publica.trim(),
  };
}

async function carregarConfig(supabaseAdmin: SupabaseAdmin) {
  const { data, error } = await bancoPagamentos(supabaseAdmin)
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
  if (!chave) return { configurada: false, modo: null };
  return {
    configurada: true,
    modo: chave.startsWith("sk_test_") ? ("teste" as const) : ("producao" as const),
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
};

const CAMPOS_PEDIDO =
  "id, codigo, status, valor_total, plano_nome, plano_tipo_acesso, plano_duracao_quantidade, plano_duracao_unidade, metodo_pagamento, gateway, origem, teste, created_at, expira_em, liberado_em, plano_id, plano_anterior, plano_nome_anterior, plano_concedido, chave_venda, validade_anterior, validade_concedida, dias_concedidos, cancelado_em, motivo_cancelamento, estornado_em, motivo_estorno, acesso_removido, comprador_nome, comprador_email, comprador_documento, comprador_tipo, user_id";

function pedidoBasico(p: PedidoLinha) {
  return {
    id: p.id,
    codigo: p.codigo,
    status: p.status as StatusPedido,
    valorTotal: p.valor_total,
    planoId: p.plano_id,
    planoNome: p.plano_nome,
    planoTipoAcesso: p.plano_tipo_acesso,
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
    const { error: eExp } = await bancoPagamentos(supabaseAdmin).rpc("expirar_pedidos_vencidos", {
      p_user: user.id,
    });
    erroRpc(eExp);

    const [
      { data: perfil, error: ePerfil },
      admin,
      { data: planos, error: ePlanos },
      config,
      { data: pedidos, error: ePedidos },
    ] = await Promise.all([
      bancoPagamentos(supabaseAdmin)
        .from("profiles")
        .select(
          "plano, plano_validade, plano_nome, cpf, cpf_hash, cnpj, instituicao, cadastro_completo_em",
        )
        .eq("id", user.id)
        .maybeSingle(),
      ehAdmin(supabaseAdmin, user.id),
      bancoPagamentos(supabaseAdmin)
        .from("planos")
        .select(
          "id, nome, descricao, beneficios, tipo_acesso, duracao_quantidade, duracao_unidade, preco_centavos, destaque, ordem",
        )
        .eq("ativo", true)
        .order("ordem")
        .order("preco_centavos"),
      carregarConfig(supabaseAdmin),
      bancoPagamentos(supabaseAdmin)
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
      planos: (planos ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        beneficios: p.beneficios,
        tipoAcesso: p.tipo_acesso,
        duracaoQuantidade: p.duracao_quantidade,
        duracaoUnidade: p.duracao_unidade as "dias" | "meses",
        precoCentavos: p.preco_centavos,
        destaque: p.destaque,
      })),
      atual: {
        plano: perfil?.plano ?? "gratis",
        planoNome: perfil?.plano_nome ?? null,
        planoValidade: perfil?.plano_validade ?? null,
        acessoAtivo: acessoAtivo(perfil?.plano, perfil?.plano_validade),
        bloqueado: perfil?.plano === "inativo",
        cadastroCompleto: Boolean(perfil?.cadastro_completo_em && perfil?.cpf),
        isAdmin: admin,
        gratuidadeUsada,
      },
      comprador: {
        cpf: mascararDocumento(perfil?.cpf),
        cnpj: perfil?.cnpj ? mascararDocumento(perfil.cnpj) : null,
        empresa: perfil?.instituicao ?? null,
      },
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
        /** O que a página mostrava: código do pedido pendente (ou null) e se ele seria mantido */
        pendenteEsperado: z.string().max(40).nullable().default(null),
        manterEsperado: z.boolean().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const config = await carregarConfig(supabaseAdmin);
    if (config.gateway !== "manual") {
      throw new Error("O pagamento online ainda não está disponível.");
    }
    if (!config.formasManual.includes(data.metodo)) {
      throw new Error("Esta forma de pagamento não está disponível no momento.");
    }
    const { data: r, error } = await bancoPagamentos(supabaseAdmin).rpc("criar_pedido", {
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
    return { pedidoId: res.pedido_id, codigo: res.codigo, reaproveitado: res.reaproveitado };
  });

export const cancelarMeuPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, pedidoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);
    const { error } = await bancoPagamentos(supabaseAdmin).rpc("cancelar_pedido", {
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
    const { data: planos, error } = await bancoPagamentos(supabaseAdmin)
      .from("planos")
      .select("*")
      .order("ordem")
      .order("created_at");
    if (error) throw new Error(error.message);
    const usos = await Promise.all(
      (planos ?? []).map(async (p) => {
        const { count, error: e } = await bancoPagamentos(supabaseAdmin)
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
        duracaoQuantidade: p.duracao_quantidade,
        duracaoUnidade: p.duracao_unidade as "dias" | "meses",
        precoCentavos: p.preco_centavos,
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
    duracaoQuantidade: z.number().int("Duração inválida.").min(1, "Duração inválida."),
    duracaoUnidade: z.enum(UNIDADES_DURACAO),
    precoCentavos: z.number().int().min(0).max(100000000, "Preço muito alto."),
    formasPagamento: z
      .array(z.enum(FORMAS_PAGAMENTO))
      .min(1, "Marque pelo menos uma forma de pagamento."),
    parcelasMax: z.number().int().min(1).max(12),
    destaque: z.boolean().default(false),
    ordem: z.number().int().min(0).max(999).default(0),
    ativo: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const max = v.duracaoUnidade === "meses" ? 120 : 3660;
    if (v.duracaoQuantidade > max) {
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
  });

export const salvarPlano = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => planoSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const row = {
      nome: data.nome,
      descricao: data.descricao,
      beneficios: data.beneficios,
      tipo_acesso: data.tipoAcesso,
      duracao_quantidade: data.duracaoQuantidade,
      duracao_unidade: data.duracaoUnidade,
      preco_centavos: data.precoCentavos,
      formas_pagamento: [...new Set(data.formasPagamento)],
      parcelas_max: data.parcelasMax,
      destaque: data.destaque,
      ordem: data.ordem,
      ativo: data.ativo,
    };
    const { error } = data.id
      ? await bancoPagamentos(supabaseAdmin).from("planos").update(row).eq("id", data.id)
      : await bancoPagamentos(supabaseAdmin).from("planos").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const excluirPlano = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { count } = await bancoPagamentos(supabaseAdmin)
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("plano_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Este plano já tem pedidos e não pode ser excluído. Desative-o.");
    }
    const { error } = await bancoPagamentos(supabaseAdmin)
      .from("planos")
      .delete()
      .eq("id", data.id);
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
    if (data.gateway !== "manual") {
      throw new Error("A integração com o Pagar.me será ligada na Etapa 2.");
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
      instrucoes,
      pagarme: { chave_publica: data.pagarmeChavePublica },
    });
    const { error } = await bancoPagamentos(supabaseAdmin).from("configuracoes").upsert(
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
          .select("id, plano, plano_validade, plano_nome")
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
    const db = bancoPagamentos(supabaseAdmin);
    const { error: eExp } = await db.rpc("expirar_pedidos_vencidos", {});
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
      db.from("pagamentos").select("pedido_id").eq("requer_revisao", true).limit(1000),
    ]);
    for (const r of [c1, c2, c3, c4, rev]) {
      if (r.error) throw new Error(r.error.message);
    }
    const idsRevisao = [...new Set((rev.data ?? []).map((r) => r.pedido_id))];

    // Busca por código, nome ou e-mail (sem caracteres que quebram o filtro)
    const busca = data.busca.replace(/[,()%*\\]/g, " ").trim();
    const montarConsulta = (colunas: string, soContar: boolean) => {
      let q = db.from("pedidos").select(colunas, { count: "exact", head: soContar });
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
    const { data: r, error } = await bancoPagamentos(supabaseAdmin).rpc("registrar_pagamento_pedido", {
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
    const { error } = await bancoPagamentos(supabaseAdmin).rpc("cancelar_pedido", {
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
    const { data: r, error } = await bancoPagamentos(supabaseAdmin).rpc("estornar_pedido", {
      p_pedido: data.pedidoId,
      p_por: user.id,
      p_remover_acesso: data.removerAcesso,
      p_motivo: data.motivo,
    });
    erroRpc(error);
    return r as unknown as {
      acesso_removido: boolean;
      /** restaurado = voltou ao acesso de antes do pedido; dias = tirou só os dias não usados */
      modo: "restaurado" | "dias" | "nada";
      dias_nao_usados: number;
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
    const { data: r, error } = await bancoPagamentos(supabaseAdmin).rpc("resolver_revisao_pagamento", {
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
    const db = bancoPagamentos(supabaseAdmin);
    const { error: eExp } = await db.rpc("expirar_pedidos_vencidos", {
      p_user: data.userId,
    });
    erroRpc(eExp);
    const [{ data: pedidos, error }, { data: historico, error: eHist }] = await Promise.all([
      db
        .from("pedidos")
        .select(CAMPOS_PEDIDO)
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("historico_acesso")
        .select(
          "id, origem, plano_antes, validade_antes, plano_depois, validade_depois, observacao, created_at",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (error) throw new Error(error.message);
    if (eHist) throw new Error(eHist.message);
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
    const { data: r, error } = await bancoPagamentos(supabaseAdmin).rpc("registrar_venda_admin", {
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
