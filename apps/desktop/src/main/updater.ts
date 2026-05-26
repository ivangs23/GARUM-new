import { BrowserWindow } from 'electron';
import { autoUpdater, type ProgressInfo } from 'electron-updater';
import { diag } from './diag';
import { IPC, type UpdaterStatus } from '../shared/types';

let currentStatus: UpdaterStatus = { kind: 'idle' };
let mainWin: BrowserWindow | null = null;

function setStatus(next: UpdaterStatus): void {
  currentStatus = next;
  diag('[updater] status:', next);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send(IPC.UPDATER_STATUS, next);
  }
}

export function getUpdaterStatus(): UpdaterStatus {
  return currentStatus;
}

export async function checkForUpdateNow(): Promise<void> {
  if (currentStatus.kind === 'disabled') return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus({ kind: 'error', message });
  }
}

export function installUpdateNow(): void {
  if (currentStatus.kind !== 'downloaded') return;
  autoUpdater.quitAndInstall();
}

export function setupUpdater(
  win: BrowserWindow,
  opts: { disabled: boolean; reason?: string },
): void {
  mainWin = win;

  if (opts.disabled) {
    setStatus({
      kind: 'disabled',
      reason: opts.reason ?? 'Actualizaciones desactivadas',
    });
    return;
  }

  // El renderer puede recargarse en cualquier momento. Cada vez que se cree
  // una nueva ventana principal, el caller debe llamar a setupUpdater otra
  // vez para refrescar la referencia — aquí solo guardamos la última.
  autoUpdater.logger = {
    info:  (m: unknown) => diag('[updater]', m),
    warn:  (m: unknown) => diag('[updater] WARN', m),
    error: (m: unknown) => diag('[updater] ERROR', m),
    debug: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  autoUpdater.autoDownload = true;
  // Si el usuario cierra la app sin pulsar "Reiniciar", el instalador
  // se aplica al salir de todas formas: doble red de seguridad.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.removeAllListeners();

  autoUpdater.on('checking-for-update', () => {
    setStatus({ kind: 'checking' });
  });
  autoUpdater.on('update-not-available', (info) => {
    setStatus({ kind: 'not-available', version: info.version });
  });
  autoUpdater.on('update-available', (info) => {
    setStatus({ kind: 'available', version: info.version });
  });
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    const version =
      currentStatus.kind === 'available' || currentStatus.kind === 'downloading'
        ? currentStatus.version
        : '';
    setStatus({
      kind: 'downloading',
      version,
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ kind: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    setStatus({ kind: 'error', message: err.message });
  });

  void checkForUpdateNow();
}
