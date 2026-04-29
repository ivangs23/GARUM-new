"use strict";
const electron = require("electron");
const IPC = {
  ORDERS_GET: "orders:get",
  ORDERS_MARK_DONE: "orders:mark-done",
  ORDERS_INIT: "orders:init",
  ORDERS_NEW: "orders:new",
  ORDERS_REMOVED: "orders:removed",
  CONFIG_GET: "config:get",
  CONFIG_SAVE: "config:save",
  CONFIG_RECONNECT: "config:reconnect",
  CONNECTION_STATUS: "connection:status",
  PRINTERS_LIST_WINDOWS: "printers:list-windows",
  PRINTERS_SCAN_NETWORK: "printers:scan-network",
  PRINTERS_TEST: "printers:test",
  HISTORY_LIST: "history:list",
  CONNECTION_GET: "connection:get",
  MAINTENANCE_GET: "maintenance:get",
  MAINTENANCE_CHANGED: "maintenance:changed"
};
const api = {
  // ── Pedidos ───────────────────────────────────────────────────────────────
  getOrders: () => electron.ipcRenderer.invoke(IPC.ORDERS_GET),
  /**
   * Marca un pedido como listo. Si pasas solo el id se aplica a ambos
   * destinos (legacy). Lo recomendado es pasar `{ id, destination }` para
   * marcar solo cocina o barra y permitir que la otra columna siga viva.
   */
  markDone: (payload) => electron.ipcRenderer.invoke(IPC.ORDERS_MARK_DONE, payload),
  // ── Configuración ─────────────────────────────────────────────────────────
  getConfig: () => electron.ipcRenderer.invoke(IPC.CONFIG_GET),
  saveConfig: (config) => electron.ipcRenderer.invoke(IPC.CONFIG_SAVE, config),
  /** Vuelve a aplicar la configuración (reabre el listener Realtime). */
  reconnect: () => electron.ipcRenderer.invoke(IPC.CONFIG_RECONNECT),
  // ── Eventos del main process → renderer ───────────────────────────────────
  onOrdersInit: (cb) => electron.ipcRenderer.on(IPC.ORDERS_INIT, (_e, v) => cb(v)),
  onNewOrder: (cb) => electron.ipcRenderer.on(IPC.ORDERS_NEW, (_e, v) => cb(v)),
  onOrderRemoved: (cb) => electron.ipcRenderer.on(IPC.ORDERS_REMOVED, (_e, v) => cb(v)),
  onConnectionStatus: (cb) => electron.ipcRenderer.on(IPC.CONNECTION_STATUS, (_e, v) => cb(v)),
  onMaintenanceChanged: (cb) => electron.ipcRenderer.on(IPC.MAINTENANCE_CHANGED, (_e, v) => cb(v)),
  off: (channel) => electron.ipcRenderer.removeAllListeners(channel),
  // ── Impresoras ─────────────────────────────────────────────────────────────
  listWindowsPrinters: () => electron.ipcRenderer.invoke(IPC.PRINTERS_LIST_WINDOWS),
  scanNetworkPrinters: () => electron.ipcRenderer.invoke(IPC.PRINTERS_SCAN_NETWORK),
  testPrinter: (config) => electron.ipcRenderer.invoke(IPC.PRINTERS_TEST, config),
  // ── Historial ─────────────────────────────────────────────────────────────
  listHistory: (limit, offset) => electron.ipcRenderer.invoke(IPC.HISTORY_LIST, { limit, offset }),
  // ── Conexión / Mantenimiento (pull) ───────────────────────────────────────
  getConnectionStatus: () => electron.ipcRenderer.invoke(IPC.CONNECTION_GET),
  getMaintenance: () => electron.ipcRenderer.invoke(IPC.MAINTENANCE_GET)
};
electron.contextBridge.exposeInMainWorld("api", api);
