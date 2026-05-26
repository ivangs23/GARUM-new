#!/usr/bin/env node
/**
 * Inserta pedidos de prueba directamente en Supabase con `payment_status='paid'`.
 *
 * Llega al POS Electron por Realtime → routing por destino → impresora.
 * Útil para probar punta a punta sin pasar por Stripe.
 *
 * USO:
 *   node scripts/seed-test-orders.mjs [opciones]
 *
 * OPCIONES:
 *   --count N            Cuántos pedidos crear (default 1)
 *   --table N            Forzar número de mesa (default random 1-20)
 *   --items N            Items por pedido (default random 1-4)
 *   --destination D      Forzar destino: cocina | barra | mix (default mix)
 *   --gap-ms N           Pausa entre inserts en ms (default 500)
 *   --dry-run            Mostrar lo que enviaría sin insertar
 *
 * REQUISITOS (.env.local en apps/web):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, "apps/web/.env.local");

// ── env loader (minimal, evita dotenv como dep) ─────────────────────────────
function loadEnvFile(path) {
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
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const env = loadEnvFile(ENV_PATH);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local.",
  );
  process.exit(1);
}

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    count: 1,
    table: null,
    items: null,
    destination: "mix",
    gapMs: 500,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--count": out.count = Number(next); i++; break;
      case "--table": out.table = Number(next); i++; break;
      case "--items": out.items = Number(next); i++; break;
      case "--destination":
        if (!["cocina", "barra", "mix"].includes(next)) {
          console.error(`destination debe ser cocina | barra | mix, recibido "${next}".`);
          process.exit(1);
        }
        out.destination = next;
        i++;
        break;
      case "--gap-ms": out.gapMs = Number(next); i++; break;
      case "--dry-run": out.dryRun = true; break;
      case "-h":
      case "--help":
        console.log(readFileSync(fileURLToPath(import.meta.url), "utf-8").split("\n").slice(1, 22).join("\n"));
        process.exit(0);
      default:
        console.error(`Argumento desconocido: ${a}`);
        process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// ── helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── catálogo: productos con destino derivado del category.destination ───────
async function loadCatalog() {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, is_available, category:categories(destination)")
    .eq("is_available", true);
  if (error) throw error;
  const rows = (data ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      destination:
        p.category && typeof p.category === "object" && "destination" in p.category
          ? p.category.destination
          : null,
    }))
    .filter((p) => p.destination === "cocina" || p.destination === "barra");
  if (rows.length === 0) {
    throw new Error(
      "No hay productos disponibles con category.destination en (cocina, barra). " +
        "Revisa que tus categorías tengan destination asignado.",
    );
  }
  return rows;
}

function pickItems(catalog, destination, count) {
  let pool = catalog;
  if (destination === "cocina") pool = catalog.filter((p) => p.destination === "cocina");
  else if (destination === "barra") pool = catalog.filter((p) => p.destination === "barra");
  if (pool.length === 0) {
    throw new Error(`Catálogo sin productos para destino "${destination}".`);
  }
  const items = [];
  for (let i = 0; i < count; i++) {
    const prod = pick(pool);
    const quantity = randInt(1, 2);
    items.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      quantity,
      destination: prod.destination,
    });
  }
  return items;
}

function totalOf(items) {
  return Number(items.reduce((acc, it) => acc + it.price * it.quantity, 0).toFixed(2));
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const catalog = await loadCatalog();
  console.log(
    `Catálogo cargado: ${catalog.length} productos ` +
      `(cocina=${catalog.filter((p) => p.destination === "cocina").length}, ` +
      `barra=${catalog.filter((p) => p.destination === "barra").length}).`,
  );

  for (let i = 0; i < args.count; i++) {
    const itemCount = args.items ?? randInt(1, 4);
    const items = pickItems(catalog, args.destination, itemCount);
    // Mismo cálculo que apps/web/app/api/checkout/route.ts:163-165.
    // Sin esto los campos quedan en 'na' y el POS no imprime (handleChange en
    // apps/desktop/src/main/realtime.ts:363 exige stillPending === true).
    const hasKitchen = items.some((it) => !it.destination || it.destination === "cocina");
    const hasBar = items.some((it) => it.destination === "barra");
    const order = {
      table_number: args.table ?? randInt(1, 20),
      items,
      total_amount: totalOf(items),
      payment_status: "paid",
      stripe_session_id: `test_${Date.now()}_${i}`,
      staff_status_kitchen: hasKitchen ? "pending" : "na",
      staff_status_bar: hasBar ? "pending" : "na",
    };

    console.log(
      `\n[${i + 1}/${args.count}] mesa=${order.table_number} total=${order.total_amount}€ ` +
        `items=${items.map((it) => `${it.quantity}x${it.name}(${it.destination})`).join(", ")}`,
    );

    if (args.dryRun) {
      console.log("  (dry-run) sin insert");
    } else {
      const { data, error } = await supabase
        .from("orders")
        .insert(order)
        .select("id")
        .single();
      if (error) {
        console.error("  ✗ Error insertando:", error.message);
      } else {
        console.log(`  ✓ Insertado id=${data.id}`);
      }
    }

    if (i < args.count - 1) await sleep(args.gapMs);
  }

  console.log("\nListo. Revisa el POS Electron — deberían entrar por Realtime e imprimirse.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
