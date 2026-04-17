import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia' as any,
});

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
    const session   = event.data.object as Stripe.Checkout.Session;
    const orderId   = session.client_reference_id;
    const sessionId = session.id;

    if (!orderId) {
      console.error('Webhook: client_reference_id vacío. Session:', sessionId);
      return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
    }

    // Actualización atómica: solo actualiza si sigue en 'pending'.
    // Si ya estaba pagado (webhook duplicado), no actualiza ninguna fila — sin race condition.
    const { data: updated, error } = await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'paid', stripe_session_id: sessionId })
      .eq('id', orderId)
      .eq('payment_status', 'pending')
      .select('id, table_number, total_amount, items');

    if (error) {
      console.error('Error actualizando pedido:', error);
      return NextResponse.json({ error: 'DB Update Failed' }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      console.log(`Webhook: pedido ${orderId} ya procesado (o no existe), ignorando.`);
    } else {
      const order = updated[0] as any;
      console.log(`✅ Pedido ${orderId} marcado como pagado.`);

      // Insertar en `pedidos` para que el agente de impresora lo reciba vía realtime
      const orderNumber = `P-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const orderType   = order.table_number ? 'mesa' : 'llevar';

      const { error: pedidoError } = await supabaseAdmin
        .from('pedidos')
        .insert([{
          order_number:  orderNumber,
          order_type:    orderType,
          table_number:  order.table_number ? String(order.table_number) : null,
          total_amount:  order.total_amount,
          status:        'paid',
          items:         order.items,
        }]);

      if (pedidoError) {
        console.error('Error insertando en pedidos:', pedidoError);
        // No fallamos el webhook — el pago ya está registrado en orders
      } else {
        console.log(`✅ Pedido ${orderNumber} insertado en tabla pedidos.`);
      }
    }
  }

  return NextResponse.json({ received: true });
}
