import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Marca un pedido como pagado de forma idempotente.
 *
 * Esta función es la fuente de verdad para pasar un pedido a `paid`. La usan
 * dos caminos independientes:
 *
 *  1. `/api/confirm-payment` — camino PRINCIPAL. Lo invoca el cliente justo
 *     después de que `stripe.confirmPayment` devuelve `succeeded`, igual que
 *     hace Manuela al insertar el pedido tras cobrar. Así el pedido se vuelve
 *     imprimible al instante, sin depender de que el webhook llegue.
 *  2. `/api/webhook` — camino de RESPALDO. Stripe envía `payment_intent.
 *     succeeded` de forma asíncrona; si por lo que sea el camino 1 no se
 *     ejecutó (cliente cerró el navegador, red, etc.), el webhook lo marca.
 *
 * Como ambos llaman aquí y el UPDATE es atómico (`.in('payment_status', …)`),
 * el segundo en llegar es un no-op: nunca se duplica ni se imprime dos veces.
 *
 * Caso normal: la fila estaba en `pending`. UPDATE atómico que solo dispara
 * si sigue así, protegiendo ante reintentos.
 *
 * Caso degradado: la fila quedó en `cancelled` porque el cleanup de
 * `/api/checkout` o `/api/payment-intent` llegó antes de cobrar. Si Stripe
 * confirma el pago, la reactivamos con un log explícito.
 *
 * Nota: NO reescribimos `stripe_session_id` aquí. Se asignó al crear el
 * PaymentIntent / Checkout Session y debe quedar inmutable para que la
 * columna UNIQUE no genere conflictos cruzados.
 */
export type PaidOrder = {
  id: string;
  table_number: number | null;
  total_amount: number | null;
};

export type MarkPaidResult =
  | { ok: true; order: PaidOrder | null; reactivated?: boolean }
  | { ok: false };

export async function markPaid(
  orderId: string,
  stripeRef: string,
  stripeAmountCents: number
): Promise<MarkPaidResult> {
  // 1) Leer estado actual para verificar importe antes de actualizar
  const { data: current } = await supabaseAdmin
    .from("orders")
    .select("id, payment_status, table_number, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (!current) {
    console.warn(`markPaid: pedido ${orderId} no existe (ref=${stripeRef}).`);
    return { ok: true, order: null };
  }

  // Verificar que el importe cobrado por Stripe coincide con el de la BD.
  // Tolerancia de 1 céntimo por redondeo de floats.
  const expectedCents = Math.round((current.total_amount ?? 0) * 100);
  if (Math.abs(stripeAmountCents - expectedCents) > 1) {
    console.error(
      `markPaid: importe no coincide — Stripe=${stripeAmountCents}c DB=${expectedCents}c order=${orderId}. Rechazado.`
    );
    return { ok: false };
  }

  if (current.payment_status === "paid") {
    return { ok: true, order: null }; // idempotente
  }

  // 2) UPDATE atómico — acepta pending o cancelled (cleanup llegó antes que Stripe)
  const reactivating = current.payment_status === "cancelled";
  if (reactivating) {
    console.warn(`⚠ markPaid: reactivando pedido ${orderId} cancelado (ref=${stripeRef}).`);
  }

  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId)
    .in("payment_status", ["pending", "cancelled"])
    .select("id, table_number, total_amount");

  if (error) {
    console.error("markPaid: error actualizando pedido:", error);
    return { ok: false };
  }

  if (updated && updated.length > 0) {
    return { ok: true, order: updated[0] as PaidOrder, reactivated: reactivating };
  }

  return { ok: true, order: null };
}
