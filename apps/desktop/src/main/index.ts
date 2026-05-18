import { app, BrowserWindow } from 'electron';
import { autoUpdater }        from 'electron-updater';
import { createMainWindow }   from './window';
import { createTray }         from './tray';
import { setupIpc }           from './ipc';
import { startRealtimeListener, stopRealtimeListener } from './realtime';
import { loadConfig }         from './config';
import { diag }               from './diag';

// AppUserModelId — necesario en Windows para que las notificaciones
// muestren el icono y el nombre correctos en vez del de Electron.
// Coincide con el `appId` del electron-builder.yml.
app.setAppUserModelId('com.garum.desktop');

// Process-level error handlers — sin esto, una promesa rechazada o un
// throw síncrono no capturado mata el proceso silenciosamente en producción.
process.on('unhandledRejection', (reason) => {
  diag('unhandledRejection:', reason instanceof Error ? reason.stack ?? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  diag('uncaughtException:', err.stack ?? err.message);
});

// ── Instancia única ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;

// ── Arranque ──────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  mainWindow = createMainWindow();
  createTray(mainWindow);
  setupIpc(mainWindow);

  const config = loadConfig();
  const isE2E  = process.env.GARUM_E2E === '1';

  // Auto-arranque con Windows (omitir en E2E)
  if (!isE2E) {
    app.setLoginItemSettings({
      openAtLogin: config.autoLaunch,
      name: 'Garum Desktop',
    });
  }

  // Conectar Realtime (omitir en E2E). Si no hay credenciales, el listener
  // marca 'disconnected' por sí mismo para que la UI no se quede en "Conectando".
  if (!isE2E) {
    await startRealtimeListener(config.supabaseUrl, config.supabaseKey, mainWindow);
  }

  // Auto-update: comprobar GitHub Releases al arrancar (omitir en E2E y dev)
  if (!isE2E && app.isPackaged) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoUpdater.logger = { info: (m: unknown) => diag('[updater]', m), warn: (m: unknown) => diag('[updater] WARN', m), error: (m: unknown) => diag('[updater] ERROR', m), debug: (_m: unknown) => {} } as any;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available',   (info) => diag('[updater] update available:', info.version));
    autoUpdater.on('update-downloaded',  (info) => diag('[updater] update downloaded — se instalará al cerrar:', info.version));
    autoUpdater.on('error',              (err)  => diag('[updater] error:', err.message));
    autoUpdater.checkForUpdates().catch((err) => diag('[updater] checkForUpdates error:', err.message));
  }
});

// Segunda instancia → traer ventana al frente
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// No cerrar la app cuando se cierran todas las ventanas (queda en bandeja)
app.on('window-all-closed', () => { /* no salir — queda en bandeja */ });

// Limpieza al salir. `before-quit` es síncrono, lanzamos la promesa pero
// no la esperamos: con cerrar canales en background es suficiente.
app.on('before-quit', () => { void stopRealtimeListener(); });
