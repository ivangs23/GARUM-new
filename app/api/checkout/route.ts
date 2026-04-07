import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27-acacia' as any,
});

export async function POST(req: Request) {
  try {
    const { items, mesa } = await req.json();

    // 1. Crear el pedido en Supabase como PENDIENTE
    const total = items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        { 
          table_number: parseInt(mesa), 
          total_amount: total, 
          payment_status: 'pending',
          items: items // Guardamos el JSON completo para visualización del staff
        }
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    // 2. Crear sesión de Stripe referenciando este pedido
    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/success?mesa=${mesa}`,
      cancel_url: `${req.headers.get('origin')}/${mesa}`,
      client_reference_id: order.id, // ID Único de nuestra base de datos
      metadata: { mesa },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
