import { app } from 'electron';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import type { AppConfig, PrinterConfig } from '../shared/types';

// ─── Defaults ─────────────────────────────────────────────────────────────────
//
// Las credenciales de Supabase ya NO se distribuyen hardcoded en el
// repositorio. Se leen, en orden:
//   1) Variables de entorno (modo desarrollo, vía electron-vite). Útil
//      para que el equipo de desarrollo no tenga que rellenar la UI.
//   2) `config.json` del usuario (modo producción). Se gestiona desde
//      la pantalla de Configuración.
//
// Si ninguna de las dos vías aporta URL+KEY, la app arranca sin conectar
// a Supabase y el panel muestra "Sin conexión" hasta que el usuario
// rellene las credenciales en Configuración.

const ENV_URL = process.env.VITE_SUPABASE_URL ?? '';
const ENV_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

const AUTO_LAUNCH_DEFAULT = true;
const SCAN_SUBNET_DEFAULT = '';

// ─── Persistencia ─────────────────────────────────────────────────────────────

type StoredConfig = {
  supabaseUrl?: string;
  supabaseKey?: string;
  autoLaunch?: boolean;
  scanSubnet?: string;
  printers?: PrinterConfig[];
  /**
   * Identificador estable de esta instalación. Se genera una sola vez y
   * se persiste para distinguir locales en la telemetría remota
   * (tabla desktop_heartbeat). No se borra ni se sobreescribe nunca.
   */
  deviceId?: string;
};

function configPath(): string {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'config.json');
}

function readStored(): StoredConfig {
  try {
    const p = configPath();
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, 'utf-8')) as StoredConfig;
  } catch {
    return {};
  }
}

// Escritura atómica: escribe a un archivo temporal y renombra. fs.renameSync
// es atómico en POSIX y en Windows (MoveFileEx con REPLACE_EXISTING) desde
// Node 10, así que un cierre de app a mitad de write no deja config corrupta.
function writeStored(stored: StoredConfig): void {
  const target = configPath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(stored, null, 2), 'utf-8');
    renameSync(tmp, target);
  } catch (err) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export function loadConfig(): AppConfig {
  const stored = readStored();
  return {
    // ENV gana sobre lo guardado (útil en dev). En producción ENV está vacío
    // y se devuelve lo que el usuario haya guardado en Configuración.
    supabaseUrl: ENV_URL || stored.supabaseUrl || '',
    supabaseKey: ENV_KEY || stored.supabaseKey || '',
    autoLaunch:  stored.autoLaunch ?? AUTO_LAUNCH_DEFAULT,
    scanSubnet:  stored.scanSubnet ?? SCAN_SUBNET_DEFAULT,
    printers:    Array.isArray(stored.printers) ? stored.printers : [],
  };
}

/**
 * Persiste `printers`, `supabaseUrl`, `supabaseKey`, `autoLaunch` y
 * `scanSubnet`. NO sobreescribe credenciales si vienen vacías y ya hay
 * unas guardadas: protege contra guardados accidentales desde Settings.
 */
export function saveConfig(next: AppConfig): void {
  const current = readStored();
  const stored: StoredConfig = {
    supabaseUrl: next.supabaseUrl?.trim() || current.supabaseUrl || '',
    supabaseKey: next.supabaseKey?.trim() || current.supabaseKey || '',
    autoLaunch:  Boolean(next.autoLaunch),
    scanSubnet:  next.scanSubnet ?? '',
    printers:    Array.isArray(next.printers) ? next.printers : [],
    // Preservar el deviceId existente: un guardado desde Settings NO debe
    // regenerarlo (rompería la continuidad de la telemetría del local).
    deviceId:    current.deviceId,
  };
  writeStored(stored);
}

/**
 * Devuelve el identificador estable de esta instalación, generándolo y
 * persistiéndolo la primera vez. Se usa como clave en la telemetría remota
 * (desktop_heartbeat/desktop_logs/desktop_commands). Hace merge sobre el
 * config guardado para no pisar el resto de campos.
 */
export function getDeviceId(): string {
  const stored = readStored();
  if (typeof stored.deviceId === 'string' && stored.deviceId.length > 0) {
    return stored.deviceId;
  }
  const id = randomUUID();
  try {
    writeStored({ ...stored, deviceId: id });
  } catch {
    // Si no se puede persistir (disco lleno, permisos), devolvemos el id
    // igualmente: la telemetría funcionará en esta sesión aunque el id
    // cambie al reiniciar.
  }
  return id;
}
