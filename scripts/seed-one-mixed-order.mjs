#!/usr/bin/env node
/**
 * Inserta UN pedido mixto (cocina + barra) directamente en Supabase con
 * `payment_status='paid'`. Útil para verificar a mano routing y dos
 * impresoras a la vez.
 *
 * Edita las constantes de abajo y ejecuta:
 *   node scripts/seed-one-mixed-order.mjs
 *
 * Requisitos: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en
 * apps/web/.env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── EDITA ESTO ────────────────────────────────────────────────────────────
const MESA = 7;          // Número de mesa
const COCINA_COUNT = 3;  // Cuántos productos de cocina llevar
const BARRA_COUNT = 2;   // Cuántos productos de barra llevar
// ──────────────────────────────────────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, "apps/web/.env.local");

function loadEnv(path) {
  if (!existsSync(path)) {
    console.error(`No se encontró ${path}.`);
    process.exit(1);
  }
  const out = {};
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pick = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};

async function main() {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, is_available, category:categories(destination)")
    .eq("is_available", true);
  if (error) throw error;

  const all = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    destination:
      p.category && typeof p.category === "object" && "destination" in p.category
        ? p.category.destination
        : null,
  }));

  const cocinaPool = all.filter((p) => p.destination === "cocina");
  const barraPool = all.filter((p) => p.destination === "barra");

  if (cocinaPool.length < COCINA_COUNT) {
    throw new Error(`Solo hay ${cocinaPool.length} productos de cocina (necesitas ${COCINA_COUNT}).`);
  }
  if (barraPool.length < BARRA_COUNT) {
    throw new Error(`Solo hay ${barraPool.length} productos de barra (necesitas ${BARRA_COUNT}).`);
  }

  const items = [
    ...pick(cocinaPool, COCINA_COUNT).map((p) => ({
      id: p.id, name: p.name, price: p.price, quantity: 1, destination: "cocina",
    })),
    ...pick(barraPool, BARRA_COUNT).map((p) => ({
      id: p.id, name: p.name, price: p.price, quantity: 1, destination: "barra",
    })),
  ];

  const order = {
    table_number: MESA,
    items,
    total_amount: Number(items.reduce((a, it) => a + it.price * it.quantity, 0).toFixed(2)),
    payment_status: "paid",
    stripe_session_id: `test_mixed_${Date.now()}`,
    staff_status_kitchen: COCINA_COUNT > 0 ? "pending" : "na",
    staff_status_bar: BARRA_COUNT > 0 ? "pending" : "na",
  };

  console.log(`\nInsertando mesa=${MESA} total=${order.total_amount}€`);
  console.log(`  Cocina (${COCINA_COUNT}): ${items.filter(i => i.destination === "cocina").map(i => i.name).join(", ")}`);
  console.log(`  Barra (${BARRA_COUNT}):  ${items.filter(i => i.destination === "barra").map(i => i.name).join(", ")}`);

  const { data: ins, error: insErr } = await supabase
    .from("orders").insert(order).select("id").single();
  if (insErr) {
    console.error("\n✗ Error:", insErr.message);
    process.exit(1);
  }
  console.log(`\n✓ Insertado id=${ins.id}`);
  console.log("\nDebería salir 1 ticket en cocina + 1 ticket en barra.");
}

main().catch((e) => { console.error("Error fatal:", e); process.exit(1); });
