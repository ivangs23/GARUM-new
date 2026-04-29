import { app, BrowserWindow } from 'electron';
import { createMainWindow }   from './window';
import { createTray }         from './tray';
import { setupIpc }           from './ipc';
import { startRealtimeListener, stopRealtimeListener } from './realtime';
import { loadConfig }         from './config';

// AppUserModelId — necesario en Windows para que las notificaciones
// muestren el icono y el nombre correctos en vez del de Electron.
// Coincide con el `appId` del electron-builder.yml.
app.setAppUserModelId('com.garum.desktop');

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
