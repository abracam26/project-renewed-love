import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema, usuarioLogado } from "@/lib/auth-servidor";

/**
 * Server functions do Pagar.me. A lógica (chave secreta, chamadas à API) fica em
 * pagarme.server.ts e só é carregada via import() dentro dos handlers, para não
 * entrar no bundle do navegador.
 */

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

    const { consultarOrdemPagarme, processarPagamentoConfirmado } =
      await import("@/lib/pagarme.server");
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
