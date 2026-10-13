import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, type SupabaseAdmin } from "@/lib/auth-servidor";

/**
 * Integração com a API v5 do Pagar.me (pagamento online).
 *
 * - O servidor cria a ordem Pix e devolve o QR Code, mostrado no próprio site.
 * - Enquanto o QR Code está aberto, o site consulta a ordem e confirma o pagamento.
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
export type PagarmeOrdem = {
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
// Criar ordem Pix
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
  expiracaoSegundos: number;
};

export type PixGerado = {
  ordemId: string;
  qrCode: string;
  qrCodeUrl: string;
  expiraEm: string | null;
};

/** Pix direto pela API (não depende do Checkout hospedado, que precisa ser liberado por conta). */
export async function criarOrdemPix(
  supabaseAdmin: SupabaseAdmin,
  dados: DadosCriacao,
): Promise<PixGerado> {
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
      document: dados.compradorDocumento.replace(/\D/g, ""),
      document_type: dados.compradorTipo === "cnpj" ? "CNPJ" : "CPF",
    },
    payments: [{ payment_method: "pix", pix: { expires_in: dados.expiracaoSegundos } }],
    metadata: { pedido_id: dados.pedidoId, codigo: dados.codigo },
  };
  const ordem = await apiPagarme<PagarmeOrdem>("POST", "/orders", corpo);
  const pix = extrairPix(ordem);
  if (!pix) {
    const motivo = ordem.charges?.[0]?.last_transaction?.status;
    throw new Error(`O Pagar.me não gerou o Pix${motivo ? ` (${motivo})` : ""}. Tente novamente.`);
  }
  const { error } = await supabaseAdmin
    .from("pedidos")
    .update({ external_order_id: ordem.id, gateway: "pagarme" })
    .eq("id", dados.pedidoId);
  if (error) throw new Error(error.message);
  return { ordemId: ordem.id, ...pix };
}

export function extrairPix(ordem: PagarmeOrdem) {
  const t = ordem.charges?.[0]?.last_transaction as
    (PagarmeCharge["last_transaction"] & { expires_at?: string }) | undefined;
  if (!t?.qr_code || !t.qr_code_url) return null;
  return { qrCode: t.qr_code, qrCodeUrl: t.qr_code_url, expiraEm: t.expires_at ?? null };
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
          const { jaRegistrado } = await processarPagamentoConfirmado(supabaseAdmin, p.id, ordem);
          if (!jaRegistrado) confirmados++;
        }
      } catch {
        erros++;
      }
    }
    return { verificados: (pedidos ?? []).length, confirmados, erros };
  });
