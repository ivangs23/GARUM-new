/**
 * Test de integración contra Supabase REAL.
 *
 * Verifica que las migrations 007–012 dejan las RLS en el estado esperado:
 *   1. La anon key puede LEER pedidos pagados de las últimas 48h.
 *   2. La anon key puede ACTUALIZAR staff_status_kitchen / staff_status_bar
 *      en pedidos paid recientes.
 *   3. La anon key NO puede leer pedidos antiguos (>48h) — la policy de la
 *      migration 012 es restrictiva.
 *   4. La service role puede crear y borrar fixtures (fuera de RLS).
 *   5. El trigger de la migration 007 deriva staff_status global cuando
 *      kitchen y bar están en {done, na}.
 *   6. La anon key NO puede actualizar pedidos pending (solo paid).
 *
 * Requiere variables de entorno:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Ejecutar:
 *   npx tsx --test tests/integration/rls.test.ts
 *   # o, en Node 22+:
 *   node --experimental-strip-types --env-file=.env.local --test tests/integration/rls.test.ts
 *
 * Cada test crea sus propios pedidos fixture y los limpia al final.
 * No tocará datos reales mientras los IDs no colisionen (usan UUID v4).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !ANON || !SVC) {
  console.error("Faltan variables de entorno. Revisa .env.local.");
  process.exit(1);
}

const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

// Lista de IDs creados durante el test, para limpieza en after()
const createdIds: string[] = [];

async function insertOrder(input: {
  daysAgo?: number;
  payment_status?: "paid" | "pending" | "cancelled";
  staff_status_kitchen?: "pending" | "done" | "na";
  staff_status_bar?: "pending" | "done" | "na";
}) {
  const created_at =
    input.daysAgo != null
      ? new Date(Date.now() - input.daysAgo * 24 * 3600 * 1000).toISOString()
      : new Date().toISOString();

  const { data, error } = await admin
    .from("orders")
    .insert([
      {
        table_number: 99,
        total_amount: 12.34,
        payment_status: input.payment_status ?? "paid",
        staff_status_kitchen: input.staff_status_kitchen ?? "pending",
        staff_status_bar: input.staff_status_bar ?? "na",
        printed_at: null,
        created_at,
        items: [{ id: "fx", name: "Fixture", price: 12.34, quantity: 1, destination: "cocina" }],
      },
    ])
    .select()
    .single();

  if (error) throw error;
  createdIds.push(data.id);
  return data;
}

before(async () => {
  // Limpieza de cualquier residuo de runs anteriores con table_number=99
  await admin.from("orders").delete().eq("table_number", 99);
});

after(async () => {
  if (createdIds.length > 0) {
    await admin.from("orders").delete().in("id", createdIds);
  }
});

describe("RLS — desktop con anon key", () => {
  it("1. Anon LEE pedidos paid recientes (<48h)", async () => {
    const fresh = await insertOrder({ daysAgo: 0 });
    const { data, error } = await anon
      .from("orders")
      .select("id, payment_status")
      .eq("id", fresh.id);
    assert.equal(error, null, "no debería haber error");
    assert.equal(data?.length, 1, "el pedido reciente debería ser legible");
  });

  it("3. Anon NO LEE pedidos paid >48h", async () => {
    const old = await insertOrder({ daysAgo: 3 });
    const { data, error } = await anon.from("orders").select("id").eq("id", old.id);
    assert.equal(error, null);
    assert.equal(data?.length, 0, "la policy debería ocultar pedidos antiguos a anon");
  });

  it("2. Anon ACTUALIZA staff_status_kitchen en pedidos paid recientes", async () => {
    const o = await insertOrder({ daysAgo: 0, staff_status_kitchen: "pending" });
    const { data, error } = await anon
      .from("orders")
      .update({ staff_status_kitchen: "done" })
      .eq("id", o.id)
      .eq("staff_status_kitchen", "pending")
      .select("id, staff_status_kitchen, staff_status");
    assert.equal(error, null);
    assert.equal(data?.length, 1, "el UPDATE atómico debería haber afectado 1 fila");
    assert.equal(data![0].staff_status_kitchen, "done");
  });

  it('5. Trigger deriva staff_status="done" cuando kitchen=done y bar=na', async () => {
    const o = await insertOrder({
      daysAgo: 0,
      staff_status_kitchen: "pending",
      staff_status_bar: "na",
    });
    await anon.from("orders").update({ staff_status_kitchen: "done" }).eq("id", o.id);
    const { data } = await admin.from("orders").select("staff_status").eq("id", o.id).single();
    assert.equal(data?.staff_status, "done", "el trigger debería poner staff_status=done");
  });

  it('5b. Trigger mantiene staff_status="pending" si solo cocina done y bar=pending', async () => {
    const o = await insertOrder({
      daysAgo: 0,
      staff_status_kitchen: "pending",
      staff_status_bar: "pending",
    });
    await anon.from("orders").update({ staff_status_kitchen: "done" }).eq("id", o.id);
    const { data } = await admin.from("orders").select("staff_status").eq("id", o.id).single();
    assert.equal(
      data?.staff_status,
      "pending",
      "mientras barra siga pending, staff_status global debe seguir pending"
    );
  });

  it("6. Anon NO ACTUALIZA pedidos pending (no paid)", async () => {
    const p = await insertOrder({
      daysAgo: 0,
      payment_status: "pending",
      staff_status_kitchen: "pending",
    });
    const { data, error } = await anon
      .from("orders")
      .update({ staff_status_kitchen: "done" })
      .eq("id", p.id)
      .select("id");
    // RLS debería filtrar; en Supabase eso suele devolver 0 filas
    // sin error, dependiendo de la versión.
    if (error) {
      // En algunas versiones devuelve PGRST204 / RLS error
      assert.match(error.message, /policy|permission|row-level/i);
    } else {
      assert.equal(data?.length, 0, "no debería poder actualizar pedidos pending");
    }
  });

  it("Anon LEE settings públicas (modo mantenimiento)", async () => {
    const { data, error } = await anon
      .from("settings")
      .select("key, value")
      .in("key", ["maintenance_enabled", "maintenance_message"]);
    assert.equal(error, null);
    assert.ok(Array.isArray(data));
  });

  it("Anon puede reservar printed_at vía UPDATE atómico", async () => {
    const o = await insertOrder({ daysAgo: 0 });
    const ts = new Date().toISOString();
    const { data, error } = await anon
      .from("orders")
      .update({ printed_at: ts })
      .eq("id", o.id)
      .is("printed_at", null)
      .select("id, printed_at");
    assert.equal(error, null);
    assert.equal(data?.length, 1, "la primera vez debería reservarlo");

    // Segundo intento: ya está printed_at, no debería afectar nada
    const { data: data2 } = await anon
      .from("orders")
      .update({ printed_at: new Date().toISOString() })
      .eq("id", o.id)
      .is("printed_at", null)
      .select("id");
    assert.equal(data2?.length, 0, "la segunda llamada no debería actualizar (ya reservado)");
  });
});
