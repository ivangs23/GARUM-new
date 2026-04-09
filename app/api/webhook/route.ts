import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia' as any,
});

// Impedir que Next.js parsee el body — Stripe necesita el raw body para verificar la firma
export const config = { api: { bodyParser: false } };

export async function POST(req: Request) {
  const body = await req.text();
  const sig  = (await headers()).get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature error:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object as Stripe.Checkout.Session;
    const orderId  = session.client_reference_id;
    const sessionId = session.id;

    if (!orderId) {
      console.error('Webhook: client_reference_id vacío');
      return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
    }

    // Deduplicación: comprobar si ya está marcado como pagado
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('payment_status')
      .eq('id', orderId)
      .single();

    if (existing?.payment_status === 'paid') {
      console.log(`Webhook: pedido ${orderId} ya estaba pagado, ignorando.`);
      return NextResponse.json({ received: true });
    }

    // Marcar como pagado
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'paid', stripe_session_id: sessionId })
      .eq('id', orderId);

    if (error) {
      console.error('Error actualizando pedido:', error);
      return NextResponse.json({ error: 'DB Update Failed' }, { status: 500 });
    }

    console.log(`✅ Pedido ${orderId} marcado como pagado.`);
  }

  return NextResponse.json({ received: true });
}
