import { app, BrowserWindow, powerMonitor } from 'electron';
import { createMainWindow }   from './window';
import { createTray }         from './tray';
import { setupIpc }           from './ipc';
import { startRealtimeListener, stopRealtimeListener, reconnect, getConnectionStatus } from './realtime';
import { loadConfig }         from './config';
import { diag }               from './diag';
import { setupUpdater }       from './updater';

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

    // Suspensión/reanudación del PC: al dormir, el WebSocket queda medio-abierto
    // (TCP half-open) y los timers se congelan; al despertar podríamos tardar
    // en detectar que el canal está muerto. Forzamos una reconexión limpia en
    // `resume` (que re-ejecuta loadInitialOrders → backfill inmediato) en vez de
    // esperar al heartbeat-timeout. Cubre el local que suspende por la noche.
    powerMonitor.on('resume', () => {
      diag('powerMonitor: resume — forzando reconexión');
      if (mainWindow && !mainWindow.isDestroyed()) void reconnect(mainWindow);
    });
    powerMonitor.on('unlock-screen', () => {
      if (getConnectionStatus() !== 'connected') {
        diag('powerMonitor: unlock-screen y no conectado — forzando reconexión');
        if (mainWindow && !mainWindow.isDestroyed()) void reconnect(mainWindow);
      }
    });
    powerMonitor.on('suspend', () => { diag('powerMonitor: suspend (PC durmiendo)'); });
  }

  // Auto-update: el módulo updater emite estado al renderer (banner UI) y
  // sigue auto-instalando al cerrar como red de seguridad. En dev/E2E se
  // marca como 'disabled' para que el banner muestre el motivo.
  setupUpdater(mainWindow, {
    disabled: isE2E || !app.isPackaged,
    reason: isE2E ? 'E2E test mode' : 'modo desarrollo',
  });
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
