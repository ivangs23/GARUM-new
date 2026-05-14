import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';

let tray: Tray | null = null;

export function createTray(win: BrowserWindow): Tray {
  const icon = loadIcon('tray-icon.png');
  tray = new Tray(icon);
  tray.setToolTip('Garum Desktop — Iniciando...');

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Abrir panel de comandas',
        click: () => showWindow(win),
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => app.exit(0),
      },
    ]),
  );

  // Doble clic → abrir ventana
  tray.on('double-click', () => showWindow(win));

  return tray;
}

export function updateTrayStatus(status: 'idle' | 'connected' | 'new-order'): void {
  if (!tray) return;

  const tooltips: Record<typeof status, string> = {
    idle:        'Garum Desktop — Sin conexión',
    connected:   'Garum Desktop — En línea ✓',
    'new-order': 'Garum Desktop — ¡Nuevo pedido!',
  };

  tray.setToolTip(tooltips[status]);

  // Icono diferente por estado (si existen los archivos)
  const icons: Record<typeof status, string> = {
    idle:        'tray-icon-idle.png',
    connected:   'tray-icon.png',
    'new-order': 'tray-icon-alert.png',
  };

  const icon = loadIcon(icons[status]);
  if (!icon.isEmpty()) tray.setImage(icon);
}

function showWindow(win: BrowserWindow): void {
  // Si la ventana ya fue destruida (poco común — solo si el usuario cerró
  // con menú "Salir" justo antes), las llamadas .restore/.show/.focus
  // lanzan "Object has been destroyed". Mejor no hacer nada.
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function loadIcon(filename: string): ReturnType<typeof nativeImage.createEmpty> {
  const path = join(__dirname, '../../resources', filename);
  if (existsSync(path)) return nativeImage.createFromPath(path);
  // Fallback: cuadrado lila 16×16 generado en memoria
  return nativeImage.createFromDataURL(FALLBACK_ICON_BASE64);
}

// 16×16 PNG lila mínimo — reemplazar con icono real en resources/tray-icon.png
const FALLBACK_ICON_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYGD4z8BAAox' +
  'qoI0GLBsYGBiINoGRkZERbQIjIyMj2gRGJv8JAACnGQABFbIzqAAAAABJRU5ErkJggg==';
