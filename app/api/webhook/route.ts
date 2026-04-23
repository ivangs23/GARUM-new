import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { headers } from "next/headers";
import type { Json } from "@/lib/database.types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

type PaidOrder = {
  id: string;
  table_number: number | null;
  total_amount: number | null;
  items: Json;
};

async function markPaid(orderId: string, stripeRef: string) {
  // Actualización atómica: sólo actualiza si sigue pending.
  // Si otro webhook ya lo marcó como paid (reintento), no actualiza nada.
  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid", stripe_session_id: stripeRef })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id, table_number, total_amount, items");

  if (error) {
    console.error("Error actualizando pedido:", error);
    return { ok: false as const };
  }
  if (!updated || updated.length === 0) {
    console.log(`Webhook: pedido ${orderId} ya procesado (o no existe), ignorando.`);
    return { ok: true as const, order: null };
  }
  return { ok: true as const, order: updated[0] as PaidOrder };
}

async function insertPrintQueue(order: PaidOrder) {
  const orderNumber = `P-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const orderType = order.table_number ? "mesa" : "llevar";

  const { error } = await supabaseAdmin.from("pedidos").insert([
    {
      order_number: orderNumber,
      order_type: orderType,
      table_number: order.table_number ? String(order.table_number) : null,
      total_amount: order.total_amount,
      status: "paid",
      items: order.items,
    },
  ]);

  if (error) {
    console.error("Error insertando en pedidos:", error);
  } else {
    console.log(`✅ Pedido ${orderNumber} insertado en tabla pedidos.`);
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
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
      console.log(`✅ Pedido ${orderId} marcado como pagado (PaymentIntent).`);
      await insertPrintQueue(result.order);
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
      console.log(`✅ Pedido ${orderId} marcado como pagado (Checkout Session).`);
      await insertPrintQueue(result.order);
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
