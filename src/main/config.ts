import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { AppConfig, PrinterConfig } from '../shared/types';

// ── Credenciales y ajustes fijos ─────────────────────────────────────────────
export const SUPABASE_URL  = 'https://vjrttuhdrkljcdixartp.supabase.co';
export const SUPABASE_KEY  = 'sb_publishable_IePMfcjpUoUPYCIJz6e8Ng_meoCnh4y';
export const AUTO_LAUNCH   = true;
export const SCAN_SUBNET   = '';           // vacío = busca en 192.168.0/1 y 10.0.0

// ── Persistencia — solo impresoras ────────────────────────────────────────────

function configPath(): string {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'config.json');
}

function loadPrinters(): PrinterConfig[] {
  try {
    const p = configPath();
    if (!existsSync(p)) return [];
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(data.printers) ? data.printers : [];
  } catch {
    return [];
  }
}

export function loadConfig(): AppConfig {
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    autoLaunch:  AUTO_LAUNCH,
    scanSubnet:  SCAN_SUBNET,
    printers:    loadPrinters(),
  };
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify({ printers: config.printers }, null, 2), 'utf-8');
}
