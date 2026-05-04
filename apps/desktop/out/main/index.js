"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const supabaseJs = require("@supabase/supabase-js");
const ws = require("ws");
const nodeThermalPrinter = require("node-thermal-printer");
const child_process = require("child_process");
const net = require("net");
const util = require("util");
const os = require("os");
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
let isQuitting = false;
electron.app.on("before-quit", () => {
  isQuitting = true;
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
    if (isQuitting) return;
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
const ENV_URL = "https://vjrttuhdrkljcdixartp.supabase.co";
const ENV_KEY = "sb_publishable_IePMfcjpUoUPYCIJz6e8Ng_meoCnh4y";
const AUTO_LAUNCH_DEFAULT = true;
const SCAN_SUBNET_DEFAULT = "";
function configPath() {
  const dir = electron.app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "config.json");
}
function readStored() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}
function writeStored(stored) {
  fs.writeFileSync(configPath(), JSON.stringify(stored, null, 2), "utf-8");
}
function loadConfig() {
  const stored = readStored();
  return {
    // ENV gana sobre lo guardado (útil en dev). En producción ENV está vacío
    // y se devuelve lo que el usuario haya guardado en Configuración.
    supabaseUrl: ENV_URL,
    supabaseKey: ENV_KEY,
    autoLaunch: stored.autoLaunch ?? AUTO_LAUNCH_DEFAULT,
    scanSubnet: stored.scanSubnet ?? SCAN_SUBNET_DEFAULT,
    printers: Array.isArray(stored.printers) ? stored.printers : []
  };
}
function saveConfig(next) {
  const current = readStored();
  const stored = {
    supabaseUrl: next.supabaseUrl?.trim() || current.supabaseUrl || "",
    supabaseKey: next.supabaseKey?.trim() || current.supabaseKey || "",
    autoLaunch: Boolean(next.autoLaunch),
    scanSubnet: next.scanSubnet ?? "",
    printers: Array.isArray(next.printers) ? next.printers : []
  };
  writeStored(stored);
}
const BARRA_KEYWORDS = [
  "vino",
  "cerveza",
  "cana",
  "cafe",
  "copa",
  "coctel",
  "agua",
  "refresco",
  "infusion",
  "champan",
  "cava",
  "licor",
  "whisky",
  "whiskey",
  "gintonic",
  "gin",
  "ron",
  "vermut",
  "vermouth"
];
function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function effectiveDestination(item) {
  if (item.destination === "cocina" || item.destination === "barra") {
    return item.destination;
  }
  const n = normalize(item.name ?? "");
  return BARRA_KEYWORDS.some((kw) => n.includes(kw)) ? "barra" : "cocina";
}
function filterItems(items, dest) {
  return items.filter((it) => effectiveDestination(it) === dest);
}
function sanitizeForThermal(text) {
  return text.normalize("NFKD").replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/…/g, "...").replace(/[–—]/g, "-").replace(/€/g, "€").replace(/[^\x20-\xff]/g, "?");
}
async function printOrderTicket(order, printerConfig) {
  const dest = printerConfig.destination;
  let items;
  if (dest === "all") {
    items = order.items;
  } else {
    items = filterItems(order.items, dest);
  }
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
    printer.println(`${item.quantity}x  ${sanitizeForThermal(item.name)}`);
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
const MAX_CONCURRENCY = 64;
async function scanNetworkPrinters(customSubnet, timeoutMs = 600) {
  const baseSubnets = customSubnet ? [customSubnet.trim()] : DEFAULT_SUBNETS;
  const found = [];
  const targets = [];
  for (const subnet of baseSubnets) {
    for (let i = 1; i <= 254; i++) targets.push(`${subnet}.${i}`);
  }
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= targets.length) return;
      const host = targets[idx];
      const open = await probePort(host, 9100, timeoutMs);
      if (open) found.push({ type: "tcp", host, port: 9100 });
    }
  }
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, targets.length) },
    () => worker()
  );
  await Promise.all(workers);
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
const LOG_FILE = path.join(os.homedir(), "garum-diag.log");
function diag(...args) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const msg = args.map((a) => {
    if (typeof a === "string") return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }).join(" ");
  const line = `${ts} ${msg}`;
  console.log("[Diag]", msg);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
  }
}
function startOfTodayMadridIso(now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  const hRaw = get("hour");
  const h = parseInt(hRaw === "24" ? "00" : hRaw, 10);
  const m = parseInt(get("minute"), 10);
  const s = parseInt(get("second"), 10);
  const ms = now.getMilliseconds();
  const elapsedMs = ((h * 60 + m) * 60 + s) * 1e3 + ms;
  const todayMidnightUtc = new Date(now.getTime() - elapsedMs);
  return todayMidnightUtc.toISOString();
}
const madridDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
function isToday(iso, now = /* @__PURE__ */ new Date()) {
  return madridDayFmt.format(new Date(iso)) === madridDayFmt.format(now);
}
function msUntilNextMidnightMadrid(now = /* @__PURE__ */ new Date()) {
  const todayMidnight = new Date(startOfTodayMadridIso(now));
  const ahead25h = new Date(todayMidnight.getTime() + 25 * 60 * 60 * 1e3);
  const tomorrowMidnight = new Date(startOfTodayMadridIso(ahead25h));
  return tomorrowMidnight.getTime() - now.getTime();
}
let supabase = null;
let channel = null;
let settingsChannel = null;
const orders = /* @__PURE__ */ new Map();
let savedUrl = "";
let savedKey = "";
let savedWin = null;
let retryTimer = null;
let midnightTimer = null;
let retryDelay = 5e3;
let currentStatus = "connecting";
let currentMaintenance = { enabled: false, message: "" };
const PAGE_SIZE = 500;
async function startRealtimeListener(url, key, win) {
  if (!url || !key) {
    diag("startRealtimeListener: credenciales vacías, no conectamos.");
    sendStatus(win, "disconnected");
    return;
  }
  await teardownChannels();
  savedUrl = url;
  savedKey = key;
  savedWin = win;
  diag("startRealtimeListener: createClient", {
    url: url.slice(0, 40) + "...",
    keyPrefix: key.slice(0, 12)
  });
  supabase = supabaseJs.createClient(url, key, {
    realtime: {
      // ws en main process — sin esto, realtime-js no encuentra WebSocket usable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: ws.WebSocket
    }
  });
  supabase.realtime.onHeartbeat((status, latency) => {
    diag("heartbeat:", status, latency != null ? `${latency}ms` : "");
  });
  sendStatus(win, "connecting");
  await loadInitialOrders(win);
  await loadMaintenance(win);
  diag("subscribe: enviando join al canal garum_desktop");
  channel = supabase.channel("garum_desktop").on(
    "postgres_changes",
    { event: "*", schema: "public", table: "orders" },
    (payload) => {
      diag("postgres_changes:", payload.eventType, payload.new?.id);
      handleChange(payload.new, win);
    }
  ).subscribe((status, err) => {
    diag("subscribe[orders] callback: status=", status, "err=", err?.message ?? "null");
    if (status === "SUBSCRIBED") {
      retryDelay = 5e3;
      sendStatus(win, "connected");
      scheduleMidnightRollover();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      sendStatus(win, "disconnected");
      scheduleReconnect();
    } else if (status === "CLOSED") {
      sendStatus(win, "disconnected");
    }
  });
  settingsChannel = supabase.channel("garum_desktop_settings").on(
    "postgres_changes",
    { event: "*", schema: "public", table: "settings" },
    () => {
      void loadMaintenance(win);
    }
  ).subscribe((status) => {
    diag("subscribe[settings] callback: status=", status);
  });
}
async function stopRealtimeListener() {
  cancelReconnect();
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  await teardownChannels();
  supabase = null;
  savedUrl = "";
  savedKey = "";
  savedWin = null;
  retryDelay = 5e3;
  orders.clear();
}
async function teardownChannels() {
  if (channel && supabase) {
    try {
      await supabase.removeChannel(channel);
    } catch {
    }
  }
  channel = null;
  if (settingsChannel && supabase) {
    try {
      await supabase.removeChannel(settingsChannel);
    } catch {
    }
  }
  settingsChannel = null;
}
async function reconnect(win) {
  const cfg = loadConfig();
  await stopRealtimeListener();
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    await startRealtimeListener(cfg.supabaseUrl, cfg.supabaseKey, win);
  } else {
    sendStatus(win, "disconnected");
  }
}
async function loadInitialOrders(win) {
  if (!supabase) return;
  const startToday = startOfTodayMadridIso();
  diag("fetch inicial: query desde", startToday);
  const todays = await fetchPaged(
    (q) => q.eq("payment_status", "paid").gte("created_at", startToday)
  );
  const stalePending = await fetchPaged(
    (q) => q.eq("payment_status", "paid").lt("created_at", startToday).or("staff_status_kitchen.eq.pending,staff_status_bar.eq.pending")
  );
  orders.clear();
  [...todays, ...stalePending].forEach((o) => orders.set(o.id, o));
  diag("cache poblado con", orders.size, "pedidos. Enviando ORDERS_INIT.");
  win.webContents.send(IPC.ORDERS_INIT, [...orders.values()]);
  const unprinted = todays.filter((o) => o.printed_at == null);
  if (unprinted.length > 0) {
    diag("arrancando impresión de", unprinted.length, "pedidos no impresos");
    void reprintMissed(unprinted);
  }
}
async function fetchPaged(build) {
  if (!supabase) return [];
  const out = [];
  let from = 0;
  for (let i = 0; i < 20; i++) {
    const baseQ = supabase.from("orders").select("*");
    const res = await build(baseQ).order("created_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (res.error) {
      console.error("[Realtime] fetchPaged error:", res.error.message);
      break;
    }
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += rows.length;
  }
  return out;
}
async function reprintMissed(list) {
  if (!supabase) return;
  const { printers } = loadConfig();
  if (printers.length === 0) return;
  for (const order of list) {
    const { data, error } = await supabase.from("orders").update({ printed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", order.id).is("printed_at", null).select("id");
    if (error) {
      console.error("[Realtime] error reservando print:", error.message);
      continue;
    }
    if (!data || data.length === 0) continue;
    try {
      await printOrder(order, printers);
    } catch (e) {
      console.error("[Realtime] reprint failed:", e);
      await supabase.from("orders").update({ printed_at: null }).eq("id", order.id);
    }
  }
}
async function loadMaintenance(win) {
  if (!supabase) return;
  const { data } = await supabase.from("settings").select("key, value").in("key", ["maintenance_enabled", "maintenance_message"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const next = {
    enabled: (map.get("maintenance_enabled") ?? "false") === "true",
    message: map.get("maintenance_message") ?? ""
  };
  if (next.enabled !== currentMaintenance.enabled || next.message !== currentMaintenance.message) {
    currentMaintenance = next;
    win.webContents.send(IPC.MAINTENANCE_CHANGED, next);
  }
}
function scheduleReconnect() {
  if (retryTimer || !savedUrl || !savedWin) return;
  console.log(`[Realtime] Reintentando conexión en ${retryDelay / 1e3}s…`);
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!savedWin || savedWin.isDestroyed() || !savedUrl) return;
    await teardownChannels();
    retryDelay = Math.min(retryDelay * 2, 6e4);
    await startRealtimeListener(savedUrl, savedKey, savedWin);
  }, retryDelay);
}
function cancelReconnect() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = 5e3;
}
function handleChange(order, win) {
  if (!order?.id) return;
  if (order.payment_status === "cancelled") {
    if (orders.has(order.id)) {
      orders.delete(order.id);
      win.webContents.send(IPC.ORDERS_REMOVED, order.id);
    }
    return;
  }
  if (order.payment_status !== "paid") return;
  const stillPending = order.staff_status_kitchen === "pending" || order.staff_status_bar === "pending";
  if (!isToday(order.created_at) && !stillPending) {
    return;
  }
  const isNew = !orders.has(order.id);
  orders.set(order.id, order);
  win.webContents.send(IPC.ORDERS_NEW, order);
  if (isNew && order.printed_at == null && stillPending) {
    updateTrayStatus("new-order");
    notify(order);
    setTimeout(() => updateTrayStatus("connected"), 8e3);
    void reservePrintAndDispatch(order);
  }
}
async function reservePrintAndDispatch(order) {
  if (!supabase) return;
  const { printers } = loadConfig();
  if (printers.length === 0) return;
  const { data, error } = await supabase.from("orders").update({ printed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", order.id).is("printed_at", null).select("id");
  if (error) {
    console.error("[Realtime] error reservando print:", error.message);
    return;
  }
  if (!data || data.length === 0) return;
  try {
    await printOrder(order, printers);
  } catch (err) {
    console.error("[Realtime] Error al imprimir:", err);
    await supabase.from("orders").update({ printed_at: null }).eq("id", order.id);
  }
}
async function markOrderDone(id, destination) {
  if (!supabase) throw new Error("Sin conexión");
  const column = destination === "cocina" ? "staff_status_kitchen" : "staff_status_bar";
  const { error } = await supabase.from("orders").update({ [column]: "done" }).eq("id", id).eq(column, "pending");
  if (error) throw new Error(error.message);
}
function getOrders() {
  return [...orders.values()].sort((a, b) => {
    const aDone = a.staff_status_kitchen !== "pending" && a.staff_status_bar !== "pending";
    const bDone = b.staff_status_kitchen !== "pending" && b.staff_status_bar !== "pending";
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
function scheduleMidnightRollover(win) {
  if (midnightTimer) clearTimeout(midnightTimer);
  const ms = msUntilNextMidnightMadrid();
  console.log("[Realtime] Próximo cambio de día en", Math.round(ms / 6e4), "min");
  midnightTimer = setTimeout(async () => {
    console.log("[Realtime] Cambio de día — refrescando cache");
    if (!supabase || !savedWin || savedWin.isDestroyed()) return;
    await loadInitialOrders(savedWin);
    scheduleMidnightRollover();
  }, ms);
}
function sendStatus(win, status) {
  diag("sendStatus →", status);
  currentStatus = status;
  updateTrayStatus(status === "connected" ? "connected" : "idle");
  win.webContents.send(IPC.CONNECTION_STATUS, status);
}
function getConnectionStatus() {
  return currentStatus;
}
function getMaintenance() {
  return currentMaintenance;
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
function getSupabase() {
  return supabase;
}
async function listHistory(supabase2, limit, offset) {
  if (!supabase2) return [];
  const startToday = startOfTodayMadridIso();
  const { data, error } = await supabase2.from("orders").select("*").in("payment_status", ["paid", "cancelled"]).lt("created_at", startToday).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.error("[History] Error listando historial:", error.message);
    return [];
  }
  return data ?? [];
}
function setupIpc(win) {
  electron.ipcMain.handle(IPC.ORDERS_GET, () => getOrders());
  electron.ipcMain.handle(
    IPC.ORDERS_MARK_DONE,
    async (_e, payload) => {
      if (typeof payload === "string") {
        await markOrderDone(payload, "cocina").catch(() => {
        });
        await markOrderDone(payload, "barra").catch(() => {
        });
      } else {
        await markOrderDone(payload.id, payload.destination);
      }
    }
  );
  electron.ipcMain.handle(IPC.CONFIG_GET, () => loadConfig());
  electron.ipcMain.handle(IPC.CONFIG_SAVE, async (_e, config) => {
    saveConfig(config);
  });
  electron.ipcMain.handle(IPC.CONFIG_RECONNECT, async () => {
    await reconnect(win);
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
  electron.ipcMain.handle(IPC.HISTORY_LIST, async (_e, args) => {
    return listHistory(getSupabase(), args.limit, args.offset);
  });
  electron.ipcMain.handle(IPC.CONNECTION_GET, () => getConnectionStatus());
  electron.ipcMain.handle(IPC.MAINTENANCE_GET, () => getMaintenance());
}
electron.app.setAppUserModelId("com.garum.desktop");
if (!electron.app.requestSingleInstanceLock()) {
  electron.app.quit();
  process.exit(0);
}
let mainWindow = null;
electron.app.whenReady().then(async () => {
  mainWindow = createMainWindow();
  createTray(mainWindow);
  setupIpc(mainWindow);
  const config = loadConfig();
  const isE2E = process.env.GARUM_E2E === "1";
  if (!isE2E) {
    electron.app.setLoginItemSettings({
      openAtLogin: config.autoLaunch,
      name: "Garum Desktop"
    });
  }
  if (!isE2E) {
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
electron.app.on("before-quit", () => {
  void stopRealtimeListener();
});
