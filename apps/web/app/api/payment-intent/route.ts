import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

type IncomingItem = {
  id: string | number;
  name: string;
  quantity: number | string;
  destination?: "cocina" | "barra" | null;
};

type ValidatedItem = {
  id: string | number;
  name: string;
  price: number;
  quantity: number;
  destination: "cocina" | "barra" | null;
};

// UUIDs solo contienen hex y guiones — '_' es separador seguro
function parseItemId(id: string | number): { productId: string; extraIds: string[] } {
  const parts = String(id).split("_");
  return { productId: parts[0], extraIds: parts.slice(1) };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items, mesa } = body;

    // --- Validación de entrada ---
    const mesaNum = parseInt(mesa, 10);
    if (!Number.isInteger(mesaNum) || mesaNum < 1 || mesaNum > 999) {
      return NextResponse.json({ error: "Número de mesa inválido" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "El carrito está vacío" }, { status: 400 });
    }
    if (items.length > 50) {
      return NextResponse.json({ error: "Demasiados ítems en el carrito" }, { status: 400 });
    }
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        return NextResponse.json({ error: "Cantidad de ítem inválida" }, { status: 400 });
      }
    }

    // --- Recalcula precios server-side (evita manipulación en cliente) ---
    const productIds = [
      ...new Set((items as IncomingItem[]).map((i) => parseItemId(i.id).productId)),
    ];
    const allExtraIds = [
      ...new Set((items as IncomingItem[]).flatMap((i) => parseItemId(i.id).extraIds)),
    ].filter(Boolean);

    type ProductRow = { id: string; name: string; price: number; is_available: boolean };
    type ExtraRow = { id: string; price: number };

    const { data: rawProducts, error: prodError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, is_available")
      .in("id", productIds);
    if (prodError) throw prodError;
    const products = (rawProducts ?? []) as ProductRow[];

    let extraMap = new Map<string, number>();
    if (allExtraIds.length > 0) {
      const { data: rawExtras, error: extrasError } = await supabaseAdmin
        .from("product_extras")
        .select("id, price")
        .in("id", allExtraIds);
      if (extrasError) throw extrasError;
      extraMap = new Map((rawExtras ?? []).map((e: ExtraRow) => [e.id, Number(e.price)]));
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalCents = 0;
    const validatedItems: ValidatedItem[] = [];

    for (const item of items as IncomingItem[]) {
      const { productId, extraIds } = parseItemId(item.id);
      const product = productMap.get(productId);
      if (!product) {
        return NextResponse.json(
          { error: `Producto no encontrado: ${productId}` },
          { status: 400 }
        );
      }
      if (!product.is_available) {
        return NextResponse.json(
          { error: `El producto "${product.name}" ya no está disponible` },
          { status: 400 }
        );
      }

      let priceCents = Math.round(Number(product.price) * 100);
      for (const extraId of extraIds) {
        const extraPrice = extraMap.get(extraId);
        if (extraPrice === undefined) {
          return NextResponse.json({ error: `Extra no encontrado: ${extraId}` }, { status: 400 });
        }
        priceCents += Math.round(extraPrice * 100);
      }

      const qty = Math.floor(Number(item.quantity));
      totalCents += priceCents * qty;

      validatedItems.push({
        id: item.id,
        name: item.name,
        price: priceCents / 100,
        quantity: qty,
        destination: item.destination ?? null,
      });
    }

    // Cap defensivo: ver /api/checkout para razonamiento.
    if (totalCents > 1_000_000) {
      return NextResponse.json({ error: "Importe del pedido fuera de rango" }, { status: 400 });
    }
    if (totalCents <= 0) {
      return NextResponse.json({ error: "Importe del pedido inválido" }, { status: 400 });
    }

    // --- Limpia órdenes pending stale (> 15 min) SOLO de esta mesa ---
    // Ver comentario en /api/checkout: limitar a la mesa evita pisar
    // un pedido legítimo de otro cliente cuando su PaymentIntent sigue
    // vivo en Stripe. El webhook reactiva si llega un pago a un pedido
    // erróneamente cancelado.
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "cancelled" })
      .eq("payment_status", "pending")
      .eq("table_number", mesaNum)
      .lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    // Sub-estados por destino para el trigger BEFORE INSERT
    const hasKitchen = validatedItems.some((it) => !it.destination || it.destination === "cocina");
    const hasBar = validatedItems.some((it) => it.destination === "barra");

    // --- Crea la orden en pending ---
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert([
        {
          table_number: mesaNum,
          total_amount: totalCents / 100,
          payment_status: "pending",
          items: validatedItems,
          staff_status_kitchen: hasKitchen ? "pending" : "na",
          staff_status_bar: hasBar ? "pending" : "na",
        },
      ])
      .select()
      .single();
    if (orderError) throw orderError;

    // --- Crea PaymentIntent con métodos automáticos (Apple Pay, Google Pay, Bizum, tarjeta…) ---
    // Stripe sólo muestra los métodos habilitados en Dashboard para esta cuenta.
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: { order_id: order.id, mesa: String(mesaNum) },
      description: `Garum · Mesa ${mesaNum} · pedido ${order.id.slice(0, 8)}`,
    });

    // Guardamos el PI id en stripe_session_id para trazabilidad y webhook idempotente
    await supabaseAdmin.from("orders").update({ stripe_session_id: intent.id }).eq("id", order.id);

    return NextResponse.json({
      clientSecret: intent.client_secret,
      orderId: order.id,
    });
  } catch (err) {
    console.error("PaymentIntent Error:", err);
    return NextResponse.json(
      { error: "Error al iniciar el pago. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
