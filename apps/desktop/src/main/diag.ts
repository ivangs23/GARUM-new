import { appendFileSync, renameSync, statSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { shipLog, type TelemetryLevel } from './telemetry';

const LOG_FILE = join(homedir(), 'garum-diag.log');

/**
 * Clasifica una línea de log en un nivel para la telemetría remota. Heurística
 * por palabras clave: suficiente para filtrar errores/warnings en el panel sin
 * tener que reescribir todas las llamadas a `diag()`.
 */
function classifyLevel(msg: string): TelemetryLevel {
  const s = msg.toLowerCase();
  if (
    s.includes('fatal') || s.includes('error') || s.includes('falló') ||
    s.includes('rechaz') || s.includes('uncaught')
  ) return 'error';
  if (
    s.includes('timeout') || s.includes('reintent') || s.includes('reconex') ||
    s.includes('máximo') || s.includes('disconnected') || s.includes('unhandled') ||
    s.includes('abandonada')
  ) return 'warn';
  return 'info';
}

/**
 * Líneas rutinarias de alto volumen y bajo valor que NO merece enviar al sink
 * remoto (seguirían en el fichero local). Evita inundar desktop_logs con
 * heartbeats y sondeos del updater, y deja ver los eventos que importan
 * (reconexiones, errores, timeline de pedidos). OJO: `heartbeat timeout` NO
 * entra aquí — ese sí queremos verlo (lo clasifica como warn).
 */
function isRemoteNoise(msg: string): boolean {
  if (/^heartbeat: (sent|ok)/.test(msg)) return true;
  if (msg.startsWith('[updater] Checking for update')) return true;
  if (/^\[updater\] (Update for version|status: \{"kind":"(checking|not-available)")/.test(msg)) return true;
  return false;
}
const LOG_FILE_OLD = `${LOG_FILE}.1`;
const MAX_BYTES = 2 * 1024 * 1024;

function rotateIfNeeded(): void {
  try {
    const size = statSync(LOG_FILE).size;
    if (size < MAX_BYTES) return;
    try { unlinkSync(LOG_FILE_OLD); } catch { /* may not exist */ }
    renameSync(LOG_FILE, LOG_FILE_OLD);
  } catch { /* file may not exist yet */ }
}

export function diag(...args: unknown[]): void {
  const ts = new Date().toISOString();
  const msg = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  const line = `${ts} ${msg}`;
  console.log('[Diag]', msg);
  try {
    rotateIfNeeded();
    appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore */ }
  // Tee a telemetría remota (best-effort). El fichero local sigue siendo la
  // fuente de verdad; esto solo encola para verlo en remoto. shipLog nunca lanza.
  // Filtramos el ruido rutinario (heartbeats/updater) para no inundar el sink.
  if (!isRemoteNoise(msg)) shipLog(classifyLevel(msg), msg);
}
