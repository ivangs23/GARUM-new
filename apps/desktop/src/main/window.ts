import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { diag } from './diag';

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
    backgroundColor: '#f4f4f5',
    webPreferences: {
      preload:          join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox:          true,
      nodeIntegration:  false,
      devTools:         !app.isPackaged,
    },
  });

  // Mostrar cuando esté lista (evita flash blanco)
  win.on('ready-to-show', () => {
    diag('window: ready-to-show → win.show()');
    win.show();
  });

  win.webContents.on('did-finish-load', () => {
    diag('window: did-finish-load');
    if (!win.isVisible()) win.show();
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    diag('window: did-fail-load', code, desc, url);
    win.show(); // mostrar aunque sea con error
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    diag('window: render-process-gone', JSON.stringify(details));
  });

  // Fallback: si en 10 s la ventana sigue oculta, mostrarla de todas formas
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      diag('window: fallback show after 10s timeout');
      win.show();
    }
  }, 10_000);

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
