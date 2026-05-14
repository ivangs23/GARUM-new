import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { headers } from "next/headers";
import { requireServerEnv } from "@/lib/env";

const stripe = new Stripe(requireServerEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2026-04-22.dahlia",
});
const STRIPE_WEBHOOK_SECRET = requireServerEnv("STRIPE_WEBHOOK_SECRET");

/**
 * Marca un pedido como pagado de forma idempotente.
 *
 * Caso normal: la fila estaba en `pending`. Hacemos un UPDATE atómico que
 * solo dispara si sigue así, lo que protege ante reintentos del webhook.
 *
 * Caso degradado: la fila quedó en `cancelled` porque el cleanup de
 * `/api/checkout` o `/api/payment-intent` llegó antes de que Stripe
 * cobrara. Si Stripe nos confirma el pago, lo reactivamos con un log
 * explícito (lo deseable es que esto pase muy pocas veces; si pasa a
 * menudo hay que bajar más el timeout de cleanup).
 *
 * Nota: NO reescribimos `stripe_session_id` aquí. Se asignó al crear
 * el PaymentIntent / Checkout Session y debe quedar inmutable para
 * que la columna UNIQUE no genere conflictos cruzados.
 */
type PaidOrder = {
  id: string;
  table_number: number | null;
  total_amount: number | null;
};

async function markPaid(orderId: string, stripeRef: string) {
  // 1) intento normal: pending → paid
  const { data: paidRows, error: paidErr } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id, table_number, total_amount");

  if (paidErr) {
    console.error("Error actualizando pedido (pending→paid):", paidErr);
    return { ok: false as const };
  }
  if (paidRows && paidRows.length > 0) {
    return {
      ok: true as const,
      order: paidRows[0] as PaidOrder,
      reactivated: false,
    };
  }

  // 2) ¿estaba como cancelled por el cleanup de stale orders?
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, payment_status, table_number, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (!existing) {
    console.warn(`Webhook: pedido ${orderId} no existe (Stripe ref=${stripeRef}).`);
    return { ok: true as const, order: null };
  }

  if (existing.payment_status === "paid") {
    // Ya estaba pagado (reintento de Stripe). Idempotente, no hacemos nada.
    console.log(`Webhook: pedido ${orderId} ya estaba paid, idempotente.`);
    return { ok: true as const, order: null };
  }

  if (existing.payment_status === "cancelled") {
    console.warn(
      `⚠ Webhook: reactivando pedido ${orderId} cancelado (cleanup llegó antes que Stripe). ref=${stripeRef}`
    );
    const { data: reactivated, error: reErr } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", orderId)
      .eq("payment_status", "cancelled")
      .select("id, table_number, total_amount");
    if (reErr) {
      console.error("Error reactivando pedido cancelled→paid:", reErr);
      return { ok: false as const };
    }
    if (reactivated && reactivated.length > 0) {
      return {
        ok: true as const,
        order: reactivated[0] as PaidOrder,
        reactivated: true,
      };
    }
  }

  return { ok: true as const, order: null };
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook signature error:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // ── Ruta nueva: Payment Element embebido ─────────────────────────────────
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.order_id;

    if (!orderId) {
      console.error("Webhook: metadata.order_id vacío. PI:", intent.id);
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    const result = await markPaid(orderId, intent.id);
    if (!result.ok) return NextResponse.json({ error: "DB Update Failed" }, { status: 500 });
    if (result.order) {
      console.log(
        `✅ Pedido ${orderId} ${result.reactivated ? "REACTIVADO" : "marcado"} como pagado (PaymentIntent).`
      );
    }
    return NextResponse.json({ received: true });
  }

  // ── Ruta legacy: Stripe Checkout Session ─────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.client_reference_id;
    const sessionId = session.id;

    if (!orderId) {
      console.error("Webhook: client_reference_id vacío. Session:", sessionId);
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    const result = await markPaid(orderId, sessionId);
    if (!result.ok) return NextResponse.json({ error: "DB Update Failed" }, { status: 500 });
    if (result.order) {
      console.log(
        `✅ Pedido ${orderId} ${result.reactivated ? "REACTIVADO" : "marcado"} como pagado (Checkout Session).`
      );
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
