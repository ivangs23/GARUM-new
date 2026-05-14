import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

// UUIDs only contain hex chars and hyphens — '_' is a safe separator
function parseItemId(id: string | number): { productId: string; extraIds: string[] } {
  const parts = String(id).split("_");
  return { productId: parts[0], extraIds: parts.slice(1) };
}

type CartItemInput = {
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items, mesa } = body as { items: CartItemInput[]; mesa: string };

    // --- Input validation ---
    const mesaNum = parseInt(mesa, 10);
    if (!Number.isInteger(mesaNum) || mesaNum < 1 || mesaNum > 999) {
      return NextResponse.json({ error: "Número de mesa inválido" }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "El carrito está vacío" }, { status: 400 });
    }

    // Cap defensivo: una mesa real no encarga >50 líneas distintas. Cualquier
    // valor mayor casi seguro es un intento de DoS o un cliente roto.
    if (items.length > 50) {
      return NextResponse.json({ error: "Demasiados ítems en el carrito" }, { status: 400 });
    }

    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        return NextResponse.json({ error: "Cantidad de ítem inválida" }, { status: 400 });
      }
    }

    // --- Fetch real prices from DB (prevents price manipulation) ---
    const productIds = [...new Set(items.map((i) => parseItemId(i.id).productId))];
    const allExtraIds = [...new Set(items.flatMap((i) => parseItemId(i.id).extraIds))].filter(
      Boolean
    );

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
      const extras = (rawExtras ?? []) as ExtraRow[];
      extraMap = new Map(extras.map((e) => [e.id, Number(e.price)]));
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // --- Recalculate totals server-side using integer cents ---
    let totalCents = 0;
    const validatedItems: ValidatedItem[] = [];

    for (const item of items) {
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
        price: priceCents / 100, // store in euros, verified server-side
        quantity: qty,
        destination: item.destination ?? null,
      });
    }

    // Cap defensivo: un pedido legítimo no llega a €10.000. Por encima asumimos
    // manipulación o cliente roto y rechazamos antes de hablar con Stripe.
    if (totalCents > 1_000_000) {
      return NextResponse.json({ error: "Importe del pedido fuera de rango" }, { status: 400 });
    }
    if (totalCents <= 0) {
      return NextResponse.json({ error: "Importe del pedido inválido" }, { status: 400 });
    }

    const total = totalCents / 100;

    // --- Cleanup stale pending orders (> 15 min) SOLO de esta mesa ---
    // Antes cancelábamos cualquier pending > 30 min global, lo que provocaba
    // que un cliente que pasara el tiempo navegando con un PaymentIntent
    // todavía válido en Stripe acabara con la fila a 'cancelled' y, al pagar,
    // el webhook no encontrara nada que actualizar. Limitando al `mesaNum`
    // y bajando a 15 min se reduce drásticamente esa colisión, y el webhook
    // está reforzado para reactivar pedidos cancelados que reciban pago.
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "cancelled" })
      .eq("payment_status", "pending")
      .eq("table_number", mesaNum)
      .lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    // --- Pre-calcular sub-estados por destino para el trigger BEFORE INSERT ---
    const hasKitchen = validatedItems.some((it) => !it.destination || it.destination === "cocina");
    const hasBar = validatedItems.some((it) => it.destination === "barra");

    // --- Create order in Supabase ---
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert([
        {
          table_number: mesaNum,
          total_amount: total,
          payment_status: "pending",
          items: validatedItems,
          staff_status_kitchen: hasKitchen ? "pending" : "na",
          staff_status_bar: hasBar ? "pending" : "na",
        },
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    // --- Create Stripe Checkout session ---
    // En producción NEXT_PUBLIC_APP_URL DEBE estar configurada; el fallback a
    // `origin` o `localhost` solo aplica en dev. Si Stripe usa la URL de éxito
    // y apunta a localhost desde un entorno de producción se rompe el flujo.
    const isProd = process.env.NODE_ENV === "production";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      (isProd ? null : req.headers.get("origin") ?? "http://localhost:3001");
    if (!origin) {
      console.error("Checkout: NEXT_PUBLIC_APP_URL no configurada en producción");
      return NextResponse.json({ error: "Servicio mal configurado" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: validatedItems.map((item) => ({
        price_data: {
          currency: "eur",
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url: `${origin}/success?mesa=${mesaNum}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${mesaNum}`,
      client_reference_id: order.id,
      metadata: { mesa: String(mesaNum), order_id: order.id },
    });

    // --- Save stripe_session_id for webhook deduplication ---
    await supabaseAdmin.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout Error:", err);
    return NextResponse.json(
      { error: "Error al procesar el pedido. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
