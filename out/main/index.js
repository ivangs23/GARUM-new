"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const supabaseJs = require("@supabase/supabase-js");
const nodeThermalPrinter = require("node-thermal-printer");
const child_process = require("child_process");
const net = require("net");
const util = require("util");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const net__namespace = /* @__PURE__ */ _interopNamespaceDefault(net);
const is = {
  dev: !electron.app.isPackaged
};
({
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
});
function createMainWindow() {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 550,
    title: "Garum — Panel de Comandas",
    icon: path.join(__dirname, "../../resources/icon.png"),
    show: false,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });
  win.on("ready-to-show", () => win.show());
  win.on("close", (e) => {
    e.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
let tray = null;
function createTray(win) {
  const icon = loadIcon("tray-icon.png");
  tray = new electron.Tray(icon);
  tray.setToolTip("Garum Desktop — Iniciando...");
  tray.setContextMenu(
    electron.Menu.buildFromTemplate([
      {
        label: "Abrir panel de comandas",
        click: () => showWindow(win)
      },
      { type: "separator" },
      {
        label: "Salir",
        click: () => electron.app.exit(0)
      }
    ])
  );
  tray.on("double-click", () => showWindow(win));
  return tray;
}
function updateTrayStatus(status) {
  if (!tray) return;
  const tooltips = {
    idle: "Garum Desktop — Sin conexión",
    connected: "Garum Desktop — En línea ✓",
    "new-order": "Garum Desktop — ¡Nuevo pedido!"
  };
  tray.setToolTip(tooltips[status]);
  const icons = {
    idle: "tray-icon-idle.png",
    connected: "tray-icon.png",
    "new-order": "tray-icon-alert.png"
  };
  const icon = loadIcon(icons[status]);
  if (!icon.isEmpty()) tray.setImage(icon);
}
function showWindow(win) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function loadIcon(filename) {
  const path$1 = path.join(__dirname, "../../resources", filename);
  if (fs.existsSync(path$1)) return electron.nativeImage.createFromPath(path$1);
  return electron.nativeImage.createFromDataURL(FALLBACK_ICON_BASE64);
}
const FALLBACK_ICON_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYGD4z8BAAoxqoI0GLBsYGBiINoGRkZERbQIjIyMj2gRGJv8JAACnGQABFbIzqAAAAABJRU5ErkJggg==";
const SUPABASE_URL = "https://vjrttuhdrkljcdixartp.supabase.co";
const SUPABASE_KEY = "sb_publishable_IePMfcjpUoUPYCIJz6e8Ng_meoCnh4y";
const AUTO_LAUNCH = true;
const SCAN_SUBNET = "";
function configPath() {
  const dir = electron.app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "config.json");
}
function loadPrinters() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return [];
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Array.isArray(data.printers) ? data.printers : [];
  } catch {
    return [];
  }
}
function loadConfig() {
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    autoLaunch: AUTO_LAUNCH,
    scanSubnet: SCAN_SUBNET,
    printers: loadPrinters()
  };
}
function saveConfig(config) {
  fs.writeFileSync(configPath(), JSON.stringify({ printers: config.printers }, null, 2), "utf-8");
}
async function printOrderTicket(order, printerConfig) {
  const dest = printerConfig.destination;
  const items = dest === "all" ? order.items : order.items.filter((i) => !i.destination || i.destination === dest);
  if (items.length === 0) return;
  const iface = buildInterface(printerConfig);
  const printer = new nodeThermalPrinter.ThermalPrinter({
    type: nodeThermalPrinter.PrinterTypes.EPSON,
    interface: iface,
    characterSet: nodeThermalPrinter.CharacterSet.PC858_EURO,
    removeSpecialCharacters: false,
    options: { timeout: 5e3 }
  });
  const connected = await printer.isPrinterConnected();
  if (!connected) {
    throw new Error(`Impresora no accesible: ${printerConfig.label} (${iface})`);
  }
  const destLabel = dest === "cocina" ? "COCINA" : dest === "barra" ? "BARRA" : "TODOS";
  const time = new Date(order.created_at).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println("GARUM VINOTECA");
  printer.setTextNormal();
  printer.bold(false);
  printer.drawLine();
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(destLabel);
  printer.setTextNormal();
  printer.alignLeft();
  printer.bold(true);
  printer.println(`MESA ${order.table_number}`);
  printer.bold(false);
  printer.println(`Hora: ${time}`);
  printer.drawLine();
  for (const item of items) {
    printer.alignLeft();
    printer.setTextSize(1, 1);
    printer.println(`${item.quantity}x  ${item.name}`);
    printer.setTextNormal();
  }
  printer.drawLine();
  printer.alignCenter();
  printer.println(`Pedido #${order.id.slice(-6).toUpperCase()}`);
  printer.newLine();
  printer.cut();
  await printer.execute();
}
function buildInterface(config) {
  switch (config.adapter) {
    case "escpos-tcp":
      return `tcp://${config.host ?? "127.0.0.1"}:${config.port ?? 9100}`;
    case "windows":
      return `printer:${config.printerName ?? ""}`;
    default:
      return `tcp://${config.host ?? "127.0.0.1"}:${config.port ?? 9100}`;
  }
}
const execAsync = util.promisify(child_process.exec);
async function listWindowsPrinters() {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"',
      { timeout: 8e3 }
    );
    const raw = JSON.parse(stdout.trim());
    const names = Array.isArray(raw) ? raw : [raw];
    return names.map((name) => ({ type: "windows", name }));
  } catch {
    return [];
  }
}
const DEFAULT_SUBNETS = ["192.168.1", "192.168.0", "10.0.0"];
async function scanNetworkPrinters(customSubnet, timeoutMs = 600) {
  const baseSubnets = customSubnet ? [customSubnet.trim()] : DEFAULT_SUBNETS;
  const found = [];
  const checks = [];
  for (const subnet of baseSubnets) {
    for (let i = 1; i <= 254; i++) {
      const host = `${subnet}.${i}`;
      checks.push(
        probePort(host, 9100, timeoutMs).then((open) => {
          if (open) found.push({ type: "tcp", host, port: 9100 });
        })
      );
    }
  }
  await Promise.all(checks);
  return found.sort((a, b) => {
    const lastA = parseInt(a.host.split(".").pop() ?? "0", 10);
    const lastB = parseInt(b.host.split(".").pop() ?? "0", 10);
    return lastA - lastB;
  });
}
function probePort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net__namespace.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.connect(port, host);
  });
}
async function printOrder(order, printers) {
  if (printers.length === 0) return;
  const results = await Promise.allSettled(
    printers.map((printer) => printOrderTicket(order, printer))
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[Printer] Error en "${printers[i].label}":`, result.reason);
    }
  });
}
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
let supabase = null;
let channel = null;
const orders = /* @__PURE__ */ new Map();
let savedUrl = "";
let savedKey = "";
let savedWin = null;
let retryTimer = null;
let retryDelay = 5e3;
async function startRealtimeListener(url, key, win) {
  savedUrl = url;
  savedKey = key;
  savedWin = win;
  supabase = supabaseJs.createClient(url, key);
  sendStatus(win, "connecting");
  const { data, error } = await supabase.from("orders").select("*").eq("payment_status", "paid").neq("staff_status", "done").order("created_at", { ascending: true }).limit(100);
  if (error) {
    console.error("[Realtime] Error cargando pedidos iniciales:", error.message);
    sendStatus(win, "disconnected");
    return;
  }
  orders.clear();
  data.forEach((o) => orders.set(o.id, o));
  win.webContents.send(IPC.ORDERS_INIT, [...orders.values()]);
  channel = supabase.channel("garum_desktop").on(
    "postgres_changes",
    { event: "*", schema: "public", table: "orders" },
    (payload) => handleChange(payload.new, win)
  ).subscribe((status) => {
    if (status === "SUBSCRIBED") {
      retryDelay = 5e3;
      sendStatus(win, "connected");
    } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
      sendStatus(win, "disconnected");
      scheduleReconnect();
    }
  });
}
function stopRealtimeListener() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (channel && supabase) {
    try {
      supabase.removeChannel(channel);
    } catch {
    }
    channel = null;
  }
  supabase = null;
  savedUrl = "";
  savedKey = "";
  savedWin = null;
  retryDelay = 5e3;
  orders.clear();
}
function scheduleReconnect() {
  if (retryTimer || !savedUrl || !savedWin) return;
  console.log(`[Realtime] Reintentando conexión en ${retryDelay / 1e3}s…`);
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!savedWin || savedWin.isDestroyed() || !savedUrl) return;
    if (channel && supabase) {
      try {
        supabase.removeChannel(channel);
      } catch {
      }
      channel = null;
    }
    retryDelay = Math.min(retryDelay * 2, 6e4);
    await startRealtimeListener(savedUrl, savedKey, savedWin);
  }, retryDelay);
}
function handleChange(order, win) {
  if (!order?.id) return;
  const isActive = order.payment_status === "paid" && order.staff_status !== "done";
  if (isActive) {
    const isNew = !orders.has(order.id);
    orders.set(order.id, order);
    win.webContents.send(IPC.ORDERS_NEW, order);
    if (isNew) {
      updateTrayStatus("new-order");
      notify(order);
      setTimeout(() => updateTrayStatus("connected"), 8e3);
      const { printers } = loadConfig();
      if (printers.length > 0) {
        printOrder(order, printers).catch(
          (err) => console.error("[Realtime] Error al imprimir:", err)
        );
      }
    }
  } else {
    orders.delete(order.id);
    win.webContents.send(IPC.ORDERS_REMOVED, order.id);
  }
}
async function markOrderDone(id) {
  if (!supabase) return;
  orders.delete(id);
  const { error } = await supabase.from("orders").update({ staff_status: "done" }).eq("id", id);
  if (error) console.error("[Realtime] Error marcando como listo:", error.message);
}
function getOrders() {
  return [...orders.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
function sendStatus(win, status) {
  updateTrayStatus(status === "connected" ? "connected" : "idle");
  win.webContents.send(IPC.CONNECTION_STATUS, status);
}
function notify(order) {
  try {
    const n = new electron.Notification({
      title: `🍽 Mesa ${order.table_number} — Nuevo pedido`,
      body: order.items.map((i) => `${i.quantity}× ${i.name}`).join("\n"),
      icon: path.join(__dirname, "../../resources/icon.png"),
      silent: false
    });
    n.show();
  } catch {
  }
}
function setupIpc(win) {
  electron.ipcMain.handle(IPC.ORDERS_GET, () => getOrders());
  electron.ipcMain.handle(IPC.ORDERS_MARK_DONE, async (_e, id) => {
    await markOrderDone(id);
  });
  electron.ipcMain.handle(IPC.CONFIG_GET, () => loadConfig());
  electron.ipcMain.handle(IPC.CONFIG_SAVE, async (_e, config) => {
    saveConfig(config);
  });
  electron.ipcMain.handle(IPC.PRINTERS_LIST_WINDOWS, () => listWindowsPrinters());
  electron.ipcMain.handle(IPC.PRINTERS_SCAN_NETWORK, () => {
    const { scanSubnet } = loadConfig();
    return scanNetworkPrinters(scanSubnet || void 0);
  });
  electron.ipcMain.handle(IPC.PRINTERS_TEST, async (_e, printerConfig) => {
    const testOrder = {
      id: "test-00000000",
      table_number: 0,
      items: [{ id: "test", name: "Ticket de prueba OK", price: 0, quantity: 1 }],
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    await printOrderTicket(testOrder, printerConfig);
  });
}
if (!electron.app.requestSingleInstanceLock()) {
  electron.app.quit();
  process.exit(0);
}
let mainWindow = null;
electron.app.whenReady().then(async () => {
  mainWindow = createMainWindow();
  createTray(mainWindow);
  setupIpc();
  const config = loadConfig();
  electron.app.setLoginItemSettings({
    openAtLogin: config.autoLaunch,
    name: "Garum Desktop"
  });
  if (config.supabaseUrl && config.supabaseKey) {
    await startRealtimeListener(config.supabaseUrl, config.supabaseKey, mainWindow);
  }
});
electron.app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
electron.app.on("window-all-closed", () => {
});
electron.app.on("before-quit", () => stopRealtimeListener());
