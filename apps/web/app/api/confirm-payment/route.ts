import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireServerEnv } from "@/lib/env";
import { markPaid } from "@/lib/mark-paid";

const stripe = new Stripe(requireServerEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2026-04-22.dahlia",
});

/**
 * Confirmación de pago en CALIENTE (camino principal).
 *
 * Lo llama el cliente justo después de que `stripe.confirmPayment` devuelve
 * `succeeded`. En lugar de esperar al webhook asíncrono de Stripe (que puede
 * tardar, fallar o no estar configurado), verificamos el PaymentIntent
 * directamente contra Stripe y marcamos el pedido `paid` al momento. Así el
 * desktop recibe el pedido por Realtime e imprime sin demora — el mismo
 * comportamiento que Manuela, donde el pedido se inserta tras cobrar.
 *
 * Seguridad: NO confiamos en el cliente para el estado del pago. Solo
 * recibimos el `paymentIntentId`; el resto (que esté `succeeded`, el importe
 * cobrado y a qué pedido pertenece) lo leemos de Stripe server-side. El
 * `order_id` se toma de la metadata del PaymentIntent, no del cuerpo de la
 * petición, para que un cliente no pueda marcar pagado un pedido ajeno.
 *
 * El webhook sigue activo como respaldo y es idempotente, así que si este
 * endpoint y el webhook se ejecutan ambos, el segundo es un no-op.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const paymentIntentId = body?.paymentIntentId;

    if (typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_")) {
      return NextResponse.json({ error: "paymentIntentId inválido" }, { status: 400 });
    }

    // Fuente de verdad: el propio Stripe, no el cliente.
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== "succeeded") {
      // El pago aún no está confirmado (p.ej. flujo con redirección pendiente).
      // No marcamos nada; el webhook lo hará cuando Stripe confirme.
      return NextResponse.json({ paid: false, status: intent.status });
    }

    const orderId = intent.metadata?.order_id;
    if (!orderId) {
      console.error("confirm-payment: metadata.order_id vacío. PI:", intent.id);
      return NextResponse.json({ error: "Pedido no asociado al pago" }, { status: 400 });
    }

    const result = await markPaid(orderId, intent.id, intent.amount_received);
    if (!result.ok) {
      return NextResponse.json({ error: "No se pudo confirmar el pedido" }, { status: 500 });
    }

    return NextResponse.json({ paid: true, orderId });
  } catch (err) {
    console.error("confirm-payment Error:", err);
    return NextResponse.json({ error: "Error al confirmar el pago." }, { status: 500 });
  }
}
