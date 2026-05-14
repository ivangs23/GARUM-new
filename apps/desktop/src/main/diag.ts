import { appendFileSync, renameSync, statSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_FILE = join(homedir(), 'garum-diag.log');
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
}
