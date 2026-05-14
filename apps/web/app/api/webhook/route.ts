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

async function markPaid(orderId: string, stripeRef: string, stripeAmountCents: number) {
  // 1) Leer estado actual para verificar importe antes de actualizar
  const { data: current } = await supabaseAdmin
    .from("orders")
    .select("id, payment_status, table_number, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (!current) {
    console.warn(`Webhook: pedido ${orderId} no existe (ref=${stripeRef}).`);
    return { ok: true as const, order: null };
  }

  // Verificar que el importe cobrado por Stripe coincide con el de la BD.
  // Tolerancia de 1 céntimo por redondeo de floats.
  const expectedCents = Math.round((current.total_amount ?? 0) * 100);
  if (Math.abs(stripeAmountCents - expectedCents) > 1) {
    console.error(
      `Webhook: importe no coincide — Stripe=${stripeAmountCents}c DB=${expectedCents}c order=${orderId}. Rechazado.`
    );
    return { ok: false as const };
  }

  if (current.payment_status === "paid") {
    return { ok: true as const, order: null }; // idempotente
  }

  // 2) UPDATE atómico — acepta pending o cancelled (cleanup llegó antes que Stripe)
  const reactivating = current.payment_status === "cancelled";
  if (reactivating) {
    console.warn(`⚠ Webhook: reactivando pedido ${orderId} cancelado (ref=${stripeRef}).`);
  }

  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId)
    .in("payment_status", ["pending", "cancelled"])
    .select("id, table_number, total_amount");

  if (error) {
    console.error("Error actualizando pedido:", error);
    return { ok: false as const };
  }

  if (updated && updated.length > 0) {
    return { ok: true as const, order: updated[0] as PaidOrder, reactivated: reactivating };
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

    const result = await markPaid(orderId, intent.id, intent.amount_received);
    if (!result.ok) return NextResponse.json({ error: "DB Update Failed" }, { status: 500 });
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

    const result = await markPaid(orderId, sessionId, session.amount_total ?? 0);
    if (!result.ok) return NextResponse.json({ error: "DB Update Failed" }, { status: 500 });
    return NextResponse.json({ received: true });
  }

  console.warn(`Webhook: evento no manejado ${event.type} (id=${event.id})`);
  return NextResponse.json({ received: true });
}
