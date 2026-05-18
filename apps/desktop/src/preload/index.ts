import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AppConfig,
  type Order,
  type PrinterConfig,
  type DiscoveredPrinter,
  type MaintenanceState,
} from '../shared/types';

// API expuesta al renderer a través de contextBridge.
// El renderer accede a `window.api.*` — nunca a `ipcRenderer` directamente.
const api = {
  // ── Pedidos ───────────────────────────────────────────────────────────────
  getOrders: (): Promise<Order[]> =>
    ipcRenderer.invoke(IPC.ORDERS_GET),

  /**
   * Marca un pedido como listo. Si pasas solo el id se aplica a ambos
   * destinos (legacy). Lo recomendado es pasar `{ id, destination }` para
   * marcar solo cocina o barra y permitir que la otra columna siga viva.
   */
  markDone: (
    payload: string | { id: string; destination: 'cocina' | 'barra' },
  ): Promise<void> =>
    ipcRenderer.invoke(IPC.ORDERS_MARK_DONE, payload),

  // ── Configuración ─────────────────────────────────────────────────────────
  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_GET),

  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_SAVE, config),

  /** Vuelve a aplicar la configuración (reabre el listener Realtime). */
  reconnect: (): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_RECONNECT),

  // ── Eventos del main process → renderer ───────────────────────────────────
  onOrdersInit: (cb: (orders: Order[]) => void) =>
    ipcRenderer.on(IPC.ORDERS_INIT, (_e, v) => cb(v)),

  onNewOrder: (cb: (order: Order) => void) =>
    ipcRenderer.on(IPC.ORDERS_NEW, (_e, v) => cb(v)),

  onOrderRemoved: (cb: (id: string) => void) =>
    ipcRenderer.on(IPC.ORDERS_REMOVED, (_e, v) => cb(v)),

  onConnectionStatus: (cb: (status: string) => void) =>
    ipcRenderer.on(IPC.CONNECTION_STATUS, (_e, v) => cb(v)),

  onMaintenanceChanged: (cb: (state: MaintenanceState) => void) =>
    ipcRenderer.on(IPC.MAINTENANCE_CHANGED, (_e, v) => cb(v)),

  onPrintError: (cb: (err: { orderId: string; mesa: number; reason: string }) => void) =>
    ipcRenderer.on(IPC.PRINT_ERROR, (_e, v) => cb(v)),

  off: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),

  // ── Impresoras ─────────────────────────────────────────────────────────────
  listWindowsPrinters: (): Promise<DiscoveredPrinter[]> =>
    ipcRenderer.invoke(IPC.PRINTERS_LIST_WINDOWS),

  scanNetworkPrinters: (): Promise<DiscoveredPrinter[]> =>
    ipcRenderer.invoke(IPC.PRINTERS_SCAN_NETWORK),

  testPrinter: (config: PrinterConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.PRINTERS_TEST, config),

  // ── Historial ─────────────────────────────────────────────────────────────
  listHistory: (limit: number, offset: number): Promise<Order[]> =>
    ipcRenderer.invoke(IPC.HISTORY_LIST, { limit, offset }),

  // ── Conexión / Mantenimiento (pull) ───────────────────────────────────────
  getConnectionStatus: (): Promise<string> =>
    ipcRenderer.invoke(IPC.CONNECTION_GET),

  getMaintenance: (): Promise<MaintenanceState> =>
    ipcRenderer.invoke(IPC.MAINTENANCE_GET),
};

contextBridge.exposeInMainWorld('api', api);

export type ApiType = typeof api;
