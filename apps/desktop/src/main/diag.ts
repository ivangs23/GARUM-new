// Logger de diagnóstico TEMPORAL. Escribe a consola Y a fichero para depurar
// el flujo de conexión Realtime. Eliminar este fichero y sus llamadas cuando
// el bug esté resuelto.

import { appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_FILE = join(homedir(), 'garum-diag.log');

export function diag(...args: unknown[]): void {
  const ts = new Date().toISOString();
  const msg = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  const line = `${ts} ${msg}`;
  console.log('[Diag]', msg);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
}
