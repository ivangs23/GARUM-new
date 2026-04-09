import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia' as any,
});

export async function POST(req: Request) {
  try {
    const { items, mesa } = await req.json();

    if (!items?.length) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
    }

    const total = items.reduce(
      (acc: number, item: any) => acc + item.price * item.quantity,
      0
    );

    // 1 — Crear pedido en Supabase como pendiente
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        table_number: parseInt(mesa),
        total_amount: total,
        payment_status: 'pending',
        items,
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // 2 — Crear sesión de Stripe Checkout
    const origin = req.headers.get('origin') ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      // payment_method_types omitido → Stripe elige automáticamente según la región
      line_items: items.map((item: any) => ({
        price_data: {
          currency: 'eur',
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100), // céntimos
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: `${origin}/success?mesa=${mesa}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/${mesa}`,
      client_reference_id: order.id,
      metadata: { mesa: String(mesa), order_id: order.id },
    });

    // 3 — Guardar stripe_session_id en el pedido (para deduplicación en el webhook)
    await supabaseAdmin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Checkout Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
