import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type LaunchedApp = {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  close: () => Promise<void>;
};

/**
 * Lanza la app Electron empaquetada (out/main/index.js) en modo E2E:
 *  - GARUM_E2E=1 desactiva Realtime y autoarranque
 *  - userData aislado por test (no toca el config real del usuario)
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'garum-e2e-'));

  // Heredamos el entorno EXCEPTO ELECTRON_RUN_AS_NODE, que si está
  // exportado en el shell del usuario fuerza a Electron a arrancar como Node
  // y `require('electron')` deja de devolver la API.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v;
  }
  env.GARUM_E2E  = '1';
  env.NODE_ENV   = 'production';

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // La app intercepta `close` para esconder a la bandeja, así que `app.close()`
  // de Playwright se cuelga. Forzamos `app.exit(0)` desde el main process.
  const close = async () => {
    try {
      await app.evaluate(({ app: electronApp }) => electronApp.exit(0));
    } catch { /* el proceso ya pudo haber salido */ }
    try { await app.close(); } catch { /* idem */ }
  };

  return { app, window, userDataDir, close };
}

/**
 * Reemplaza un handler IPC del main process. Útil para mockear respuestas
 * (impresoras, escaneo de red, etc.) sin tocar código de producción.
 */
export async function mockIpcHandle<T>(
  app: ElectronApplication,
  channel: string,
  result: T,
): Promise<void> {
  await app.evaluate(({ ipcMain }, args) => {
    ipcMain.removeHandler(args.channel);
    ipcMain.handle(args.channel, async () => args.result);
  }, { channel, result });
}

/**
 * Envía un evento desde el main process a la primera BrowserWindow.
 * Sustituye al push de Supabase Realtime durante los tests.
 */
export async function pushFromMain(
  app: ElectronApplication,
  channel: string,
  payload: unknown,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, args) => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send(args.channel, args.payload);
  }, { channel, payload });
}
