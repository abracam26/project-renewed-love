import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin, tokenSchema } from "@/lib/auth-servidor";

// A lógica do Pagar.me fica em pagarme.server.ts e só é carregada via import() nos handlers,
// para não entrar no bundle do navegador.

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
