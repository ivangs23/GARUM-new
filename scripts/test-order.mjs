#!/usr/bin/env node
/**
 * Prueba MANUAL de un pedido de punta a punta SIN PAGOS.
 *
 * Inserta un pedido directamente en Supabase con `payment_status='paid'`
 * (saltandose Stripe por completo) y luego VERIFICA que el flujo funciona:
 * espera a que el desktop (Electron) lo reciba por Realtime y fije
 * `printed_at`, lo que demuestra que el ticket se imprimio.
 *
 * Es la forma mas rapida de comprobar el camino
 *   insertar pedido pagado -> Realtime -> POS -> impresora
 * sin tener que pagar nada.
 *
 * USO:
 *   node scripts/test-order.mjs [opciones]
 *
 * OPCIONES:
 *   --table N          Numero de mesa (default: aleatorio 1-20)
 *   --items N          N de lineas del pedido (default: 2)
 *   --destination D    cocina | barra | mix   (default: mix)
 *   --timeout S        Segundos a esperar la impresion (default: 30)
 *   --no-verify        Solo inserta, no espera a printed_at
 *   --cleanup          Borra TODOS los pedidos de prueba y sale
 *                      (los que tienen stripe_session_id manual_% o test_%)
 *   --dry-run          Muestra lo que insertaria sin tocar la BD
 *   -h, --help         Esta ayuda
 *
 * EJEMPLOS:
 *   node scripts/test-order.mjs                          # pedido mixto, verifica
 *   node scripts/test-order.mjs --table 7 --destination cocina
 *   node scripts/test-order.mjs --items 4 --timeout 60
 *   node scripts/test-order.mjs --no-verify              # solo dispara
 *   node scripts/test-order.mjs --cleanup                # limpia pruebas
 *
 * REQUISITOS (apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(THIS_FILE), "..");
const ENV_PATH = join(ROOT, "apps/web/.env.local");
const TEST_PREFIX = "manual_"; // marca de los pedidos creados por este script

// -- Cargador de .env minimo (sin dependencias) ------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`x No se encontro ${path}.`);
    console.error("  Crea apps/web/.env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const out = {};
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
  console.error("x Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local.");
  process.exit(1);
}

// -- Argumentos --------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    table: null,
    items: 2,
    destination: "mix",
    timeout: 30,
    verify: true,
    cleanup: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--table": out.table = Number(next); i++; break;
      case "--items": out.items = Number(next); i++; break;
      case "--destination":
        if (!["cocina", "barra", "mix"].includes(next)) {
          console.error(`x destination debe ser cocina | barra | mix (recibido "${next}").`);
          process.exit(1);
        }
        out.destination = next; i++; break;
      case "--timeout": out.timeout = Number(next); i++; break;
      case "--no-verify": out.verify = false; break;
      case "--cleanup": out.cleanup = true; break;
      case "--dry-run": out.dryRun = true; break;
      case "-h":
      case "--help": {
        const help = readFileSync(THIS_FILE, "utf-8")
          .split("*/")[0]
          .split("\n")
          .filter((l) => !l.startsWith("#!") && l.trim() !== "/**")
          .map((l) => l.replace(/^\s*\*\s?/, ""))
          .join("\n")
          .trim();
        console.log(help);
        process.exit(0);
        break;
      }
      default:
        console.error(`x Argumento desconocido: ${a}  (usa --help)`);
        process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// -- Limpieza de pedidos de prueba -------------------------------------------
async function cleanup() {
  const { data, error } = await supabase
    .from("orders")
    .delete()
    .or(`stripe_session_id.like.${TEST_PREFIX}%,stripe_session_id.like.test_%`)
    .select("id");
  if (error) {
    console.error("x Error limpiando:", error.message);
    process.exit(1);
  }
  console.log(`OK Eliminados ${data?.length ?? 0} pedidos de prueba (manual_% / test_%).`);
}

// -- Catalogo: productos disponibles con destino derivado de la categoria ----
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
        "Asigna destination a tus categorias en el panel /admin.",
    );
  }
  return rows;
}

function pickItems(catalog, destination, count) {
  let pool = catalog;
  if (destination === "cocina") pool = catalog.filter((p) => p.destination === "cocina");
  else if (destination === "barra") pool = catalog.filter((p) => p.destination === "barra");
  if (pool.length === 0) {
    throw new Error(`El catalogo no tiene productos para el destino "${destination}".`);
  }
  const items = [];
  for (let i = 0; i < count; i++) {
    const prod = pick(pool);
    items.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      quantity: randInt(1, 2),
      destination: prod.destination,
    });
  }
  return items;
}

const totalOf = (items) => Number(items.reduce((a, it) => a + it.price * it.quantity, 0).toFixed(2));

// -- Verificacion: esperar a que el desktop fije printed_at ------------------
async function verifyPrinted(orderId, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  process.stdout.write(`\nEsperando a que el POS imprima (max ${timeoutSec}s)`);
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("orders")
      .select("printed_at, printed_targets, staff_status_kitchen, staff_status_bar")
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      console.log(`\nx Error consultando estado: ${error.message}`);
      return false;
    }
    if (data?.printed_at) {
      const targets =
        data.printed_targets && typeof data.printed_targets === "object"
          ? Object.keys(data.printed_targets).length
          : 0;
      console.log(`\nOK IMPRESO. printed_at=${data.printed_at}` + (targets ? ` (${targets} impresora/s)` : ""));
      console.log(`   cocina=${data.staff_status_kitchen}  barra=${data.staff_status_bar}`);
      console.log("\nFlujo OK: pedido pagado -> Realtime -> POS -> impresora. Sin pasar por Stripe.");
      return true;
    }
    process.stdout.write(".");
    await sleep(1500);
  }
  console.log("\n! Tiempo agotado: el pedido esta en la BD y 'paid', pero printed_at sigue NULL.");
  console.log("  Posibles causas:");
  console.log("   - El POS (apps/desktop) no esta abierto o no esta 'Conectado'.");
  console.log("   - No hay impresoras configuradas en el POS (Ajustes).");
  console.log("   - Credenciales del desktop (VITE_DESKTOP_EMAIL/PASSWORD) ausentes -> no escucha.");
  console.log("   - Realtime no habilitado para la tabla 'orders'.");
  console.log("\n  El pedido SI se inserto: miralo en el panel del POS o en Supabase.");
  return false;
}

// -- Main --------------------------------------------------------------------
async function main() {
  if (args.cleanup) {
    await cleanup();
    return;
  }

  const catalog = await loadCatalog();
  console.log(
    `Catalogo: ${catalog.length} productos ` +
      `(cocina=${catalog.filter((p) => p.destination === "cocina").length}, ` +
      `barra=${catalog.filter((p) => p.destination === "barra").length}).`,
  );

  const items = pickItems(catalog, args.destination, args.items);
  const hasKitchen = items.some((it) => !it.destination || it.destination === "cocina");
  const hasBar = items.some((it) => it.destination === "barra");

  const order = {
    table_number: args.table ?? randInt(1, 20),
    items,
    total_amount: totalOf(items),
    payment_status: "paid",
    stripe_session_id: `${TEST_PREFIX}${Date.now()}`,
    staff_status_kitchen: hasKitchen ? "pending" : "na",
    staff_status_bar: hasBar ? "pending" : "na",
  };

  console.log(`\nPedido de prueba:`);
  console.log(`  mesa=${order.table_number}  total=${order.total_amount} EUR`);
  for (const it of items) {
    console.log(`   - ${it.quantity}x ${it.name}  [${it.destination}]`);
  }

  if (args.dryRun) {
    console.log("\n(dry-run) No se inserto nada.");
    return;
  }

  const { data, error } = await supabase
    .from("orders")
    .insert(order)
    .select("id")
    .single();
  if (error) {
    console.error("\nx Error insertando:", error.message);
    process.exit(1);
  }
  console.log(`\nOK Insertado id=${data.id}  (payment_status=paid)`);

  if (!args.verify) {
    console.log("Revisa el POS: deberia entrar por Realtime e imprimirse.");
    return;
  }

  const ok = await verifyPrinted(data.id, args.timeout);
  process.exit(ok ? 0 : 2);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
