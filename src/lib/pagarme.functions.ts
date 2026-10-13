import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, usuarioLogado, type SupabaseAdmin } from "@/lib/auth-servidor";

/**
 * Integração com a API v5 do Pagar.me (pagamento online).
 *
 * - O servidor cria a ordem e devolve a URL do checkout hospedado do Pagar.me.
 * - O aluno é redirecionado para o checkout e pode pagar com Pix, cartão ou boleto.
 * - Na volta ao site, o servidor consulta o status da ordem e confirma o pagamento.
 * - Um webhook (Supabase Edge Function) confirma automaticamente quando o aluno
 *   fecha o navegador depois de pagar.
 */

const API_BASE = "https://api.pagar.me/core/v5";

function chaveSecreta(): string {
  const chave = process.env["PAGARME_SECRET_KEY"]?.trim();
  if (!chave) {
    throw new Error(
      "A chave secreta do Pagar.me (PAGARME_SECRET_KEY) não está configurada no servidor.",
    );
  }
  return chave;
}

function authHeader(): string {
  return "Basic " + Buffer.from(chaveSecreta() + ":").toString("base64");
}

async function apiPagarme<T = unknown>(
  metodo: "GET" | "POST" | "PATCH",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    let msg = `Pagar.me respondeu com erro ${res.status}`;
    try {
      const j = JSON.parse(texto);
      if (j?.message) msg = `Pagar.me: ${j.message}`;
      else if (j?.errors?.[0]?.message) msg = `Pagar.me: ${j.errors[0].message}`;
    } catch {}
    console.error(`[Pagar.me] ${metodo} ${caminho} → ${res.status}:`, texto.slice(0, 500));
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// -----------------------------------------------------------------------
// Tipos do Pagar.me
// -----------------------------------------------------------------------
type PagarmeOrdem = {
  id: string;
  code: string;
  status: "pending" | "paid" | "canceled" | "failed" | "closed";
  amount: number;
  charges: PagarmeCharge[];
  checkouts?: PagarmeCheckout[];
  customer?: { id: string };
};

type PagarmeCharge = {
  id: string;
  code: string;
  status: string;
  amount: number;
  paid_at: string | null;
  payment_method: string;
  last_transaction: {
    id: string;
    status: string;
    amount: number;
    paid_at?: string;
    installments?: number;
    acquirer_tid?: string;
    qr_code?: string;
    qr_code_url?: string;
    url?: string;
  };
};

type PagarmeCheckout = {
  id: string;
  status: string;
  payment_url: string;
  expires_at: string;
};

// -----------------------------------------------------------------------
// Criar ordem com checkout
// -----------------------------------------------------------------------
export type DadosCriacao = {
  pedidoId: string;
  codigo: string;
  planoNome: string;
  valorCentavos: number;
  compradorNome: string;
  compradorEmail: string;
  compradorDocumento: string;
  compradorTipo: "cpf" | "cnpj";
  formasPagamento: ("pix" | "cartao" | "boleto")[];
  successUrl: string;
  expiracaoSegundos: number;
};

export async function criarOrdemPagarme(
  supabaseAdmin: SupabaseAdmin,
  dados: DadosCriacao,
): Promise<{ ordemId: string; checkoutUrl: string }> {
  const metodosPagarme = dados.formasPagamento.map((f) =>
    f === "cartao" ? "credit_card" : f,
  );

  const corpo = {
    code: dados.codigo,
    items: [
      {
        amount: dados.valorCentavos,
        description: dados.planoNome,
        quantity: 1,
        code: dados.pedidoId,
      },
    ],
    customer: {
      name: dados.compradorNome,
      email: dados.compradorEmail,
      type: dados.compradorTipo === "cnpj" ? "company" : "individual",
      document: dados.compradorDocumento,
      document_type: dados.compradorTipo === "cnpj" ? "CNPJ" : "CPF",
    },
    payments: [
      {
        payment_method: "checkout",
        checkout: {
          expires_in: dados.expiracaoSegundos,
          accepted_payment_methods: metodosPagarme,
          success_url: dados.successUrl,
          default_payment_method: metodosPagarme.includes("pix") ? "pix" : metodosPagarme[0],
          customer_editable: false,
          billing_address_editable: false,
          skip_checkout_success_page: false,
        },
      },
    ],
    closed: true,
    metadata: { pedido_id: dados.pedidoId, codigo: dados.codigo },
  };

  const ordem = await apiPagarme<PagarmeOrdem>("POST", "/orders", corpo);

  const checkout = ordem.checkouts?.[0];
  if (!checkout?.payment_url) {
    throw new Error("O Pagar.me não retornou a URL do checkout. Tente novamente.");
  }

  await supabaseAdmin
    .from("pedidos")
    .update({ external_order_id: ordem.id, gateway: "pagarme" })
    .eq("id", dados.pedidoId);

  return { ordemId: ordem.id, checkoutUrl: checkout.payment_url };
}

// -----------------------------------------------------------------------
// Consultar status de uma ordem
// -----------------------------------------------------------------------
export async function consultarOrdemPagarme(ordemId: string): Promise<PagarmeOrdem> {
  return apiPagarme<PagarmeOrdem>("GET", `/orders/${ordemId}`);
}

// -----------------------------------------------------------------------
// Processar pagamento confirmado (usado pelo polling e pelo webhook)
// -----------------------------------------------------------------------
export async function processarPagamentoConfirmado(
  supabaseAdmin: SupabaseAdmin,
  pedidoId: string,
  ordem: PagarmeOrdem,
): Promise<{ jaRegistrado: boolean }> {
  const charge = ordem.charges?.[0];
  if (!charge) return { jaRegistrado: false };

  const externalPaymentId = charge.id;

  const { data: existente } = await supabaseAdmin
    .from("pagamentos")
    .select("id")
    .eq("gateway", "pagarme")
    .eq("external_payment_id", externalPaymentId)
    .maybeSingle();
  if (existente) return { jaRegistrado: true };

  const metodo =
    charge.payment_method === "credit_card"
      ? "cartao"
      : charge.payment_method === "pix"
        ? "pix"
        : charge.payment_method === "boleto"
          ? "boleto"
          : "outro";

  const pagoEm = charge.paid_at ?? new Date().toISOString();

  const rpcArgs: Record<string, unknown> = {
    p_pedido: pedidoId,
    p_origem: "gateway",
    p_gateway: "pagarme",
    p_metodo: metodo,
    p_valor: charge.amount,
    p_pago_em: pagoEm,
    p_metadata: {
      external_order_id: ordem.id,
      external_payment_id: externalPaymentId,
      payment_method: charge.payment_method,
      installments: charge.last_transaction?.installments ?? 1,
      acquirer_tid: charge.last_transaction?.acquirer_tid ?? null,
    },
    p_aceitar_valor_diferente: false,
    p_external_payment_id: externalPaymentId,
  };
  const { error } = await supabaseAdmin.rpc(
    "registrar_pagamento_pedido",
    rpcArgs as unknown as Parameters<typeof supabaseAdmin.rpc<"registrar_pagamento_pedido">>[1],
  );

  if (error) {
    if (error.code === "23505") return { jaRegistrado: true };
    console.error("[Pagar.me] Erro ao registrar pagamento:", error.message);
    throw new Error(error.message);
  }

  return { jaRegistrado: false };
}

// -----------------------------------------------------------------------
// Server function: verificar pagamento (polling do frontend)
// -----------------------------------------------------------------------
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
    if (pedido.status !== "pendente") return { status: pedido.status as "cancelado" | "expirado" | "estornado" };
    if (!pedido.external_order_id) return { status: "pendente" as const };

    try {
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

// -----------------------------------------------------------------------
// Admin: verificar todos os pedidos pendentes do Pagar.me
// -----------------------------------------------------------------------
export const verificarPedidosPendentes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await exigirAdmin(data.token);
    const { data: pedidos, error } = await supabaseAdmin
      .from("pedidos")
      .select("id, external_order_id")
      .eq("status", "pendente")
      .eq("gateway", "pagarme")
      .not("external_order_id", "is", null)
      .limit(50);
    if (error) throw new Error(error.message);

    let confirmados = 0;
    let erros = 0;
    for (const p of pedidos ?? []) {
      try {
        const ordem = await consultarOrdemPagarme(p.external_order_id!);
        if (ordem.status === "paid") {
          const { jaRegistrado } = await processarPagamentoConfirmado(
            supabaseAdmin,
            p.id,
            ordem,
          );
          if (!jaRegistrado) confirmados++;
        }
      } catch {
        erros++;
      }
    }
    return { verificados: (pedidos ?? []).length, confirmados, erros };
  });
