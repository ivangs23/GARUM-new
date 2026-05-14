import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

// Cuando el usuario cierra la ventana queremos esconder a bandeja, pero cuando
// el SO/electron-vite manda SIGTERM tenemos que dejar que el quit complete:
// si `e.preventDefault()` corre durante un quit, Electron lo cancela también
// y el proceso queda zombie reteniendo el SingletonLock.
let isQuitting = false;
app.on('before-quit', () => { isQuitting = true; });

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width:     1200,
    height:    800,
    minWidth:  800,
    minHeight: 550,
    title:     'Garum — Panel de Comandas',
    icon:      join(__dirname, '../../resources/icon.png'),
    show:      false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload:          join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox:          true,
      nodeIntegration:  false,
    },
  });

  // Mostrar cuando esté lista (evita flash blanco)
  win.on('ready-to-show', () => win.show());

  // Cerrar = minimizar a bandeja (no salir), salvo que estemos saliendo de verdad.
  win.on('close', e => {
    if (isQuitting) return;
    e.preventDefault();
    win.hide();
  });

  // Abrir links externos en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
