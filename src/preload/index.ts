import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppConfig, type Order, type PrinterConfig, type DiscoveredPrinter } from '../shared/types';

// API expuesta al renderer a través de contextBridge
// El renderer accede a window.api.* — nunca a ipcRenderer directamente
const api = {
  // ── Pedidos ───────────────────────────────────────────────────────────────
  getOrders: (): Promise<Order[]> =>
    ipcRenderer.invoke(IPC.ORDERS_GET),

  markDone: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.ORDERS_MARK_DONE, id),

  // ── Configuración ─────────────────────────────────────────────────────────
  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_GET),

  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_SAVE, config),

  // ── Eventos del main process → renderer ───────────────────────────────────
  onOrdersInit: (cb: (orders: Order[]) => void) =>
    ipcRenderer.on(IPC.ORDERS_INIT, (_e, v) => cb(v)),

  onNewOrder: (cb: (order: Order) => void) =>
    ipcRenderer.on(IPC.ORDERS_NEW, (_e, v) => cb(v)),

  onOrderRemoved: (cb: (id: string) => void) =>
    ipcRenderer.on(IPC.ORDERS_REMOVED, (_e, v) => cb(v)),

  onConnectionStatus: (cb: (status: string) => void) =>
    ipcRenderer.on(IPC.CONNECTION_STATUS, (_e, v) => cb(v)),

  // Limpieza de listeners (llamar en useEffect cleanup)
  off: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),

  // ── Impresoras ─────────────────────────────────────────────────────────────
  listWindowsPrinters: (): Promise<DiscoveredPrinter[]> =>
    ipcRenderer.invoke(IPC.PRINTERS_LIST_WINDOWS),

  scanNetworkPrinters: (): Promise<DiscoveredPrinter[]> =>
    ipcRenderer.invoke(IPC.PRINTERS_SCAN_NETWORK),

  testPrinter: (config: PrinterConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.PRINTERS_TEST, config),
};

contextBridge.exposeInMainWorld('api', api);

// Tipos para el renderer (ver env.d.ts)
export type ApiType = typeof api;
