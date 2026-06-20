import { app } from 'electron';
import { openSync, readSync, closeSync, statSync } from 'fs';
import { homedir, hostname, platform, release } from 'os';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDeviceId, loadConfig } from './config';

/**
 * Telemetría remota del desktop — 3 capas, todas OUTBOUND (no abre puertos):
 *
 *   1. HEARTBEAT  → upsert cada 30s en `desktop_heartbeat` con el estado vital.
 *   2. SINK       → buffer en anillo de eventos/logs, flush batched a
 *                   `desktop_logs`. `diag()` hace tee aquí (best-effort).
 *   3. COMANDOS   → el admin inserta en `desktop_commands`; el main los recibe
 *                   por Realtime (ver realtime.ts) y `executeCommand` ejecuta
 *                   una whitelist de SOLO LECTURA y devuelve el resultado.
 *
 * Reutiliza el cliente Supabase YA autenticado (rol 'desktop') que vive en
 * realtime.ts; lo recibe vía `getClient()` para leer siempre la instancia
 * vigente tras reconexiones. Nada aquí bloquea la ruta caliente de impresión:
 * todo es fire-and-forget con try/catch y buffer acotado.
 */

export type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error';

type LogRow = {
  device_id: string;
  level: TelemetryLevel;
  event: string;
  order_id: string | null;
  data: unknown | null;
  created_at: string;
};

export type HeartbeatSnapshot = {
  connection_status: string;
  retry_count: number;
  cache_size: number;
  unprinted_count: number;
  pending_count: number;
};

export type CacheDumpRow = {
  id: string;
  table_number: number | null;
  payment_status: string;
  staff_status_kitchen: string;
  staff_status_bar: string;
  printed_at: string | null;
  created_at: string;
};

export type TelemetryPrinter = {
  label: string;
  destination: string;
  adapter: string;
  host?: string;
  port?: number;
  printerName?: string;
};

export type DesktopCommand = {
  id: number;
  device_id: string;
  command: string;
  args?: unknown;
};

type StartOpts = {
  /** Devuelve el cliente Supabase autenticado vigente (o null si no hay). */
  getClient: () => SupabaseClient | null;
  /** Estado vital para el heartbeat. */
  getSnapshot: () => HeartbeatSnapshot;
  /** Volcado ligero de la cache de pedidos (para dump_cache / dump_print_queue). */
  getCacheDump: () => CacheDumpRow[];
  /** Impresoras configuradas, sin secretos. */
  getPrinters: () => TelemetryPrinter[];
};

const HEARTBEAT_MS = 30_000;
const FLUSH_MS = 8_000;
const MAX_BUFFER = 2_000; // ~últimos N eventos si no hay conexión
const FLUSH_BATCH = 200;
const LOG_FILE = join(homedir(), 'garum-diag.log');
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let started = false;
let opts: StartOpts | null = null;
let hbTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let cachedDeviceId = '';

const buffer: LogRow[] = [];

function devId(): string {
  if (!cachedDeviceId) {
    try { cachedDeviceId = getDeviceId(); } catch { cachedDeviceId = 'unknown'; }
  }
  return cachedDeviceId;
}

function appVersion(): string {
  try { return app.getVersion(); } catch { return 'unknown'; }
}

// ─── Capa 2: sink de logs ─────────────────────────────────────────────────────

/**
 * Encola un evento para envío remoto. Best-effort: nunca lanza. Si el buffer
 * se llena (sin conexión), descarta lo MÁS VIEJO para conservar lo reciente.
 * Pensado para que `diag()` lo invoque en cada línea.
 */
export function shipLog(
  level: TelemetryLevel,
  event: string,
  fields?: { orderId?: string | null; data?: unknown },
): void {
  try {
    const orderId =
      fields?.orderId ?? (UUID_RE.exec(event)?.[0] ?? null);
    buffer.push({
      device_id: devId(),
      level,
      event: event.length > 2000 ? event.slice(0, 2000) : event,
      order_id: orderId,
      data: fields?.data ?? null,
      created_at: new Date().toISOString(),
    });
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  } catch {
    // jamás romper el logging local por culpa de la telemetría
  }
}

async function flush(): Promise<void> {
  if (flushing) return;
  const client = opts?.getClient();
  if (!client || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, FLUSH_BATCH);
  try {
    const { error } = await client.from('desktop_logs').insert(batch);
    if (error) requeue(batch);
  } catch {
    requeue(batch);
  } finally {
    flushing = false;
  }
}

/** Devuelve un lote fallido al frente del buffer, respetando el tope. */
function requeue(batch: LogRow[]): void {
  buffer.unshift(...batch);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
}

// ─── Capa 1: heartbeat ────────────────────────────────────────────────────────

async function sendHeartbeat(): Promise<void> {
  const client = opts?.getClient();
  if (!client) return;
  try {
    const snap = opts!.getSnapshot();
    const row = {
      device_id: devId(),
      app_version: appVersion(),
      connection_status: snap.connection_status,
      retry_count: snap.retry_count,
      cache_size: snap.cache_size,
      unprinted_count: snap.unprinted_count,
      pending_count: snap.pending_count,
      printers: opts!.getPrinters(),
      os: `${platform()} ${release()} · ${hostname()}`,
      uptime_s: Math.round(process.uptime()),
      updated_at: new Date().toISOString(),
    };
    await client.from('desktop_heartbeat').upsert(row, { onConflict: 'device_id' });
  } catch {
    // best-effort
  }
}

// ─── Capa 3: comandos on-demand ───────────────────────────────────────────────

/**
 * Ejecuta un comando del admin. Whitelist de SOLO LECTURA: nada muta el
 * estado del local. El resultado se escribe de vuelta en la propia fila.
 */
export async function executeCommand(cmd: DesktopCommand): Promise<void> {
  const client = opts?.getClient();
  if (!client) return;
  if (cmd.device_id !== devId()) return; // no es para este local

  let status: 'done' | 'error' = 'done';
  let result: unknown;
  try {
    switch (cmd.command) {
      case 'ping':
        result = { pong: true, app_version: appVersion(), ts: new Date().toISOString() };
        break;
      case 'tail_log':
        result = { text: tailLog(60_000) };
        break;
      case 'dump_cache':
        result = { orders: opts!.getCacheDump() };
        break;
      case 'dump_print_queue': {
        const backlog = opts!.getCacheDump().filter(
          o =>
            o.printed_at == null &&
            (o.staff_status_kitchen === 'pending' || o.staff_status_bar === 'pending'),
        );
        result = { backlog, printers: opts!.getPrinters() };
        break;
      }
      case 'dump_config':
        result = redactedConfig();
        break;
      default:
        status = 'error';
        result = { error: `comando desconocido: ${cmd.command}` };
    }
  } catch (e) {
    status = 'error';
    result = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    await client
      .from('desktop_commands')
      .update({ status, result, completed_at: new Date().toISOString() })
      .eq('id', cmd.id);
  } catch {
    // si no podemos devolver el resultado, lo dejamos pending; el admin lo verá colgado
  }
}

/** Últimos `maxBytes` del log local, sin cargar el fichero entero. */
function tailLog(maxBytes: number): string {
  try {
    const size = statSync(LOG_FILE).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    if (len <= 0) return '(log vacío)';
    const fd = openSync(LOG_FILE, 'r');
    try {
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, start);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    return `(no se pudo leer ${LOG_FILE}: ${e instanceof Error ? e.message : String(e)})`;
  }
}

/** Config actual redactada: nunca expone la key de Supabase. */
function redactedConfig(): unknown {
  const c = loadConfig();
  return {
    device_id: devId(),
    supabaseUrl: c.supabaseUrl
      ? c.supabaseUrl.replace(/^(https?:\/\/[^.]+)\..*/, '$1.…')
      : '',
    supabaseKey: c.supabaseKey ? `${c.supabaseKey.slice(0, 6)}…(${c.supabaseKey.length} chars)` : '(vacía)',
    autoLaunch: c.autoLaunch,
    scanSubnet: c.scanSubnet,
    printers: c.printers.map(p => ({
      label: p.label,
      destination: p.destination,
      adapter: p.adapter,
      host: p.host,
      port: p.port,
      printerName: p.printerName,
    })),
  };
}

// ─── Ciclo de vida ────────────────────────────────────────────────────────────

/**
 * Arranca la telemetría. Idempotente: si ya está activa solo refresca las
 * closures (para capturar el cliente Supabase recreado tras una reconexión).
 */
export function startTelemetry(o: StartOpts): void {
  opts = o;
  if (started) return;
  started = true;
  void sendHeartbeat();
  hbTimer = setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);
  flushTimer = setInterval(() => void flush(), FLUSH_MS);
}

export function stopTelemetry(): void {
  if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  started = false;
  void flush(); // último intento de vaciar el buffer al cerrar
}
