import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import { requireServerEnv } from "@/lib/env";
import { markPaid } from "@/lib/mark-paid";

const stripe = new Stripe(requireServerEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2026-04-22.dahlia",
});
const STRIPE_WEBHOOK_SECRET = requireServerEnv("STRIPE_WEBHOOK_SECRET");

/**
 * Webhook de Stripe. Camino de RESPALDO para marcar pedidos como pagados.
 *
 * El camino principal es `/api/confirm-payment`, que el cliente invoca al
 * confirmarse el pago para que el pedido se imprima al instante (como en
 * Manuela). Este webhook cubre los casos en que ese camino no se ejecutó
 * (cliente cerró el navegador, flujos con redirección como Bizum/Klarna,
 * etc.). La lógica de marcado vive en `lib/mark-paid.ts` y es idempotente,
 * así que da igual cuál de los dos llegue primero.
 */

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
