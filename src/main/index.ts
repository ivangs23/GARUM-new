import { app, BrowserWindow } from 'electron';
import { createMainWindow }   from './window';
import { createTray }         from './tray';
import { setupIpc }           from './ipc';
import { startRealtimeListener, stopRealtimeListener } from './realtime';
import { loadConfig }         from './config';

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

  // Auto-arranque con Windows
  app.setLoginItemSettings({
    openAtLogin: config.autoLaunch,
    name: 'Garum Desktop',
  });

  // Conectar Realtime si ya hay credenciales guardadas
  if (config.supabaseUrl && config.supabaseKey) {
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

// Limpieza al salir
app.on('before-quit', () => stopRealtimeListener());
