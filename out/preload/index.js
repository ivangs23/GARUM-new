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
  CONNECTION_STATUS: "connection:status",
  PRINTERS_LIST_WINDOWS: "printers:list-windows",
  PRINTERS_SCAN_NETWORK: "printers:scan-network",
  PRINTERS_TEST: "printers:test"
};
const api = {
  // ── Pedidos ───────────────────────────────────────────────────────────────
  getOrders: () => electron.ipcRenderer.invoke(IPC.ORDERS_GET),
  markDone: (id) => electron.ipcRenderer.invoke(IPC.ORDERS_MARK_DONE, id),
  // ── Configuración ─────────────────────────────────────────────────────────
  getConfig: () => electron.ipcRenderer.invoke(IPC.CONFIG_GET),
  saveConfig: (config) => electron.ipcRenderer.invoke(IPC.CONFIG_SAVE, config),
  // ── Eventos del main process → renderer ───────────────────────────────────
  onOrdersInit: (cb) => electron.ipcRenderer.on(IPC.ORDERS_INIT, (_e, v) => cb(v)),
  onNewOrder: (cb) => electron.ipcRenderer.on(IPC.ORDERS_NEW, (_e, v) => cb(v)),
  onOrderRemoved: (cb) => electron.ipcRenderer.on(IPC.ORDERS_REMOVED, (_e, v) => cb(v)),
  onConnectionStatus: (cb) => electron.ipcRenderer.on(IPC.CONNECTION_STATUS, (_e, v) => cb(v)),
  // Limpieza de listeners (llamar en useEffect cleanup)
  off: (channel) => electron.ipcRenderer.removeAllListeners(channel),
  // ── Impresoras ─────────────────────────────────────────────────────────────
  listWindowsPrinters: () => electron.ipcRenderer.invoke(IPC.PRINTERS_LIST_WINDOWS),
  scanNetworkPrinters: () => electron.ipcRenderer.invoke(IPC.PRINTERS_SCAN_NETWORK),
  testPrinter: (config) => electron.ipcRenderer.invoke(IPC.PRINTERS_TEST, config)
};
electron.contextBridge.exposeInMainWorld("api", api);
