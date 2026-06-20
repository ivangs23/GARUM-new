import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTelegram } from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Comprobador de alertas operativas. Pensado para ejecutarse cada pocos
 * minutos desde un cron (GitHub Action o Vercel Cron). Revisa dos condiciones
 * desde el lado servidor (independiente de que la telemetría del desktop
 * funcione) y notifica por Telegram una sola vez por incidente (dedupe en la
 * tabla alert_state):
 *
 *   1) Pedido `paid` con `printed_at IS NULL` y algún destino pendiente desde
 *      hace > UNPRINTED_THRESHOLD_MIN → un ticket no salió. (cubre H1..H4)
 *   2) Local sin heartbeat reciente (> HEARTBEAT_STALE_MIN) → app cerrada / PC
 *      apagado o dormido. Avisa también cuando vuelve. (cubre H3/H5)
 *
 * Seguridad: si CRON_SECRET está configurado, exige `Authorization: Bearer
 * <secret>` (o `?secret=`). Sin secreto configurado, se permite (modo dev).
 */

const UNPRINTED_THRESHOLD_MIN = 3;
const HEARTBEAT_STALE_MIN = 3;

// El cliente tipado (supabaseAdmin) no conoce las tablas nuevas (no se han
// regenerado los tipos). Para estas queries usamos una vista sin tipar; el
// service_role salta RLS, así que puede leer orders/heartbeat e insertar dedupe.
const db = supabaseAdmin as unknown as SupabaseClient;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') ?? '';
  const qs = new URL(req.url).searchParams.get('secret') ?? '';
  return auth === `Bearer ${secret}` || qs === secret;
}

/** Notifica solo si el incidente es nuevo (no estaba ya en alert_state). */
async function alertOnce(
  key: string, kind: string, ref: string, message: string,
): Promise<boolean> {
  const { error } = await db.from('alert_state').insert({ key, kind, ref, message });
  // 23505 = unique_violation → ya alertado antes, no repetimos.
  if (error && (error as { code?: string }).code === '23505') return false;
  await sendTelegram(message);
  return true;
}

/** Borra el estado de una alerta; devuelve true si había una activa. */
async function clearAlert(key: string): Promise<boolean> {
  const { data } = await db.from('alert_state').delete().eq('key', key).select('key');
  return Array.isArray(data) && data.length > 0;
}

type UnprintedOrder = { id: string; table_number: number | null; created_at: string };
type Heartbeat = { device_id: string; updated_at: string };

async function run(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const sent: string[] = [];

  // ── 1) Pedidos pagados sin imprimir ────────────────────────────────────────
  const unprintedCutoff = new Date(now - UNPRINTED_THRESHOLD_MIN * 60_000).toISOString();
  const dayAgo = new Date(now - 24 * 3_600_000).toISOString();
  const { data: unprinted, error: unprintedErr } = await db
    .from('orders')
    .select('id, table_number, created_at')
    .eq('payment_status', 'paid')
    .is('printed_at', null)
    .lt('created_at', unprintedCutoff)
    .gte('created_at', dayAgo)
    .or('staff_status_kitchen.eq.pending,staff_status_bar.eq.pending');

  if (unprintedErr) console.error('[alerts] query unprinted:', unprintedErr.message);

  for (const o of (unprinted ?? []) as UnprintedOrder[]) {
    const mins = Math.round((now - new Date(o.created_at).getTime()) / 60_000);
    const msg =
      `🔴 GARUM: pedido SIN IMPRIMIR · Mesa ${o.table_number ?? '?'} · ` +
      `pagado hace ${mins} min · id ${o.id.slice(0, 8)}`;
    if (await alertOnce(`unprinted:${o.id}`, 'unprinted', o.id, msg)) sent.push(msg);
  }

  // ── 2) Locales sin heartbeat reciente ──────────────────────────────────────
  const hbCutoffMs = now - HEARTBEAT_STALE_MIN * 60_000;
  const { data: beats, error: beatsErr } = await db
    .from('desktop_heartbeat')
    .select('device_id, updated_at');

  if (beatsErr) console.error('[alerts] query heartbeat:', beatsErr.message);

  for (const b of (beats ?? []) as Heartbeat[]) {
    const last = new Date(b.updated_at).getTime();
    const key = `offline:${b.device_id}`;
    if (last < hbCutoffMs) {
      const mins = Math.round((now - last) / 60_000);
      const msg =
        `🟠 GARUM: el local (${b.device_id.slice(0, 8)}) lleva ${mins} min sin señal. ` +
        `¿App cerrada, PC apagado o dormido?`;
      if (await alertOnce(key, 'offline', b.device_id, msg)) sent.push(msg);
    } else if (await clearAlert(key)) {
      // Volvió a estar fresco y había una alerta de caída activa → recuperación.
      const msg = `🟢 GARUM: el local (${b.device_id.slice(0, 8)}) ha vuelto a estar en línea.`;
      if (await sendTelegram(msg)) sent.push(msg);
    }
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    unprinted: (unprinted ?? []).length,
    devices: (beats ?? []).length,
    alerts_sent: sent.length,
    sent,
  });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
