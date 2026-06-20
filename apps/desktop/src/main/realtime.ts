import { BrowserWindow, Notification } from 'electron';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { setDefaultResultOrder } from 'dns';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { join } from 'path';
import { updateTrayStatus } from './tray';
import { loadConfig, getDeviceId } from './config';
import { printOrder } from './printer';
import {
  startTelemetry,
  stopTelemetry,
  executeCommand,
  type HeartbeatSnapshot,
  type CacheDumpRow,
  type TelemetryPrinter,
  type DesktopCommand,
} from './telemetry';
import {
  IPC,
  type Order,
  type ConnectionStatus,
  type MaintenanceState,
} from '../shared/types';
import { diag } from './diag';
import { startOfTodayMadridIso, isToday, msUntilNextMidnightMadrid } from '@garum/shared/format';

setDefaultResultOrder('ipv4first');

/**
 * Fetch shim sobre node:https/http con `family: 4` forzado.
 *
 * Razón histórica (v1.0.16 → v1.0.22): el local del cliente tiene pila
 * IPv6 que resuelve AAAA pero la red bloquea paquetes IPv6 outbound, así
 * que cualquier connect IPv6 se cuelga 10 s y termina en
 * UND_ERR_CONNECT_TIMEOUT. Intentamos atajarlo con:
 *   - setDefaultResultOrder('ipv4first') → undici interno lo ignora.
 *   - setGlobalDispatcher(Agent({connect:{family:4}})) → solo afecta al
 *     undici-npm, no al undici interno que usa globalThis.fetch.
 *   - undici 8 → revienta en Electron 33 (Node 20) con
 *     webidl.util.markAsUncloneable.
 *   - undici 6 + global.fetch override → Agent.connect.family no se
 *     aplica realmente, el timeout persiste.
 *
 * Nuclear option: hacemos las peticiones nosotros con node:https/http,
 * pasamos `family: 4` directo a net.connect y devolvemos un `Response`
 * estándar que cumple la interfaz que espera @supabase/supabase-js.
 * Sin deps externas, comportamiento determinista.
 */
const nodeFetch: typeof fetch = ((input, init) => {
  const init0 = init ?? {};
  const targetUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const reqFn = isHttps ? httpsRequest : httpRequest;

  // Headers → objeto plano que node:http acepta.
  const headersObj: Record<string, string> = {};
  if (init0.headers) {
    const h = init0.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { headersObj[k] = v; });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headersObj[k] = v;
    } else {
      Object.assign(headersObj, h as Record<string, string>);
    }
  }

  // Body normalizado a Buffer/string.
  let bodyBuf: Buffer | string | undefined;
  if (init0.body != null) {
    if (typeof init0.body === 'string') bodyBuf = init0.body;
    else if (init0.body instanceof Buffer) bodyBuf = init0.body;
    else if (init0.body instanceof Uint8Array) bodyBuf = Buffer.from(init0.body);
    else if (init0.body instanceof ArrayBuffer) bodyBuf = Buffer.from(init0.body);
    else bodyBuf = String(init0.body);
  }

  return new Promise<Response>((resolve, reject) => {
    const req = reqFn(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: url.pathname + url.search,
        method: init0.method ?? 'GET',
        headers: headersObj,
        family: 4, // ← el motivo de todo este shim
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const resHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach((vv) => resHeaders.append(k, vv));
            else if (v != null) resHeaders.set(k, String(v));
          }
          const status = res.statusCode ?? 0;
          // WHATWG fetch: null-body status codes (101/103/204/205/304)
          // no admiten body en el constructor de Response. Supabase REST
          // devuelve 204 cuando un UPDATE/DELETE no usa .select(), así
          // que pasar el buffer truena con "Invalid response status code
          // 204" y el SDK no recibe respuesta.
          const isNullBodyStatus =
            status === 101 || status === 103 || status === 204 ||
            status === 205 || status === 304;
          resolve(
            new Response(isNullBodyStatus ? null : buf, {
              status,
              statusText: res.statusMessage ?? '',
              headers: resHeaders,
            }),
          );
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`node-fetch timeout ${url.hostname}`));
    });
    if (bodyBuf != null) req.write(bodyBuf);
    req.end();
  });
}) as typeof fetch;

let supabase: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let settingsChannel: RealtimeChannel | null = null;
let commandsChannel: RealtimeChannel | null = null;

/**
 * Cache de pedidos en memoria. Incluye:
 *  - Todos los pagados de HOY (cualquier sub-estado).
 *  - Pendientes de DÍAS ANTERIORES que aún no han sido marcados como
 *    listos por el staff (no los retiramos a medianoche para no
 *    "perder" pedidos sin servir; ver migration 008 / fix #6).
 */
const orders = new Map<string, Order>();

// Estado de reconexión
let savedUrl  = '';
let savedKey  = '';
let savedWin: BrowserWindow | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let midnightTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let retryDelay = 5000; // ms — se duplica en cada fallo, máx 60 s
let retryCount = 0;
// Reconciliación autoritativa: cada RECONCILE_MS re-leemos la DB (vía REST,
// independiente del WebSocket Realtime) y la fusionamos en la cache. Recupera
// pedidos cuyo evento Realtime se perdió (red caída / reconexión sin replay) y
// reintenta impresiones pendientes. La DB es la fuente de verdad; Realtime es
// solo latencia baja best-effort. Sustituye al antiguo poller (que solo miraba
// la cache y por tanto no veía un pedido cuyo evento NEW nunca llegó).
const RECONCILE_MS = 15_000;

let currentStatus: ConnectionStatus = 'connecting';
let currentMaintenance: MaintenanceState = { enabled: false, message: '' };

const PAGE_SIZE = 500; // límite por página al paginar pedidos del día

// ─── Conexión ────────────────────────────────────────────────────────────────

export async function startRealtimeListener(
  url: string,
  key: string,
  win: BrowserWindow,
): Promise<void> {
  if (!url || !key) {
    diag('startRealtimeListener: credenciales vacías, no conectamos.');
    sendStatus(win, 'disconnected');
    return;
  }

  // Por si nos llaman a reconectar mientras hay una conexión viva,
  // primero limpiamos lo anterior.
  await teardownChannels();

  savedUrl = url;
  savedKey = key;
  savedWin = win;

  diag('startRealtimeListener: createClient', {
    url: url.slice(0, 40) + '...', keyPrefix: key.slice(0, 12),
  });
  // Wrap nodeFetch para volcar al log la causa real antes de que el SDK
  // de Supabase envuelva el error y solo nos llegue "fetch failed".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugFetch: any = async (input: any, init: any) => {
    const target = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    try {
      const res = await nodeFetch(input, init);
      return res;
    } catch (e) {
      const err = e as Error & { cause?: unknown; code?: string; errno?: number };
      const causeObj = err.cause as { name?: string; message?: string; code?: string; errno?: number } | undefined;
      diag(
        `[fetch] FAIL ${target}: name=${err.name} message=${err.message} ` +
        `code=${err.code ?? 'na'} errno=${err.errno ?? 'na'} ` +
        `cause=${
          causeObj
            ? JSON.stringify({
                name: causeObj.name,
                message: causeObj.message,
                code: causeObj.code,
                errno: causeObj.errno,
              })
            : 'none'
        }`,
      );
      throw e;
    }
  };

  supabase = createClient(url, key, {
    global: { fetch: debugFetch },
    realtime: {
      // ws en main process — sin esto, realtime-js no encuentra WebSocket usable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: WebSocket as any,
    },
  });

  // Diag: heartbeat status (sent/ok/timeout/disconnected) — útil para detectar
  // conexiones que se caen sin que la subscribe callback lo señale.
  supabase.realtime.onHeartbeat((status, latency) => {
    diag('heartbeat:', status, latency != null ? `${latency}ms` : '');
    if (status === 'timeout') {
      diag('heartbeat timeout — forzando reconexión');
      scheduleReconnect();
    }
  });

  // ── Autenticación con cuenta de servicio (obligatoria desde la
  // migración 014 — drop policies anon). Si la cuenta de servicio no
  // está configurada o la auth falla, el desktop quedaría como anon y
  // las policies bloquearían el UPDATE de printed_at → ningún ticket
  // se imprimiría (sin error visible si el caller no mira el log).
  // Preferimos quedarnos en 'disconnected' y avisar antes que aparentar
  // estar conectados pero romper la impresión silenciosamente.
  const desktopEmail    = process.env.VITE_DESKTOP_EMAIL;
  const desktopPassword = process.env.VITE_DESKTOP_PASSWORD;
  if (!desktopEmail || !desktopPassword) {
    diag(
      'FATAL: VITE_DESKTOP_EMAIL/VITE_DESKTOP_PASSWORD no embebidos en este build. ' +
      'El workflow desktop-release.yml debe inyectarlos vía GitHub Secrets. ' +
      'Sin ellos el desktop no puede reservar printed_at y los tickets no se imprimen.',
    );
    sendStatus(win, 'disconnected');
    return;
  }
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: desktopEmail,
    password: desktopPassword,
  });
  if (authErr) {
    // authErr.message en undici suele ser "fetch failed" sin contexto.
    // Volcamos también la causa subyacente (errno, dirección remota, etc.)
    // que sí lleva la info útil para diagnosticar red/TLS/firewall.
    const cause = (authErr as { cause?: unknown }).cause;
    const causeText = cause
      ? typeof cause === 'object' && cause !== null
        ? JSON.stringify({
            name: (cause as { name?: string }).name,
            message: (cause as { message?: string }).message,
            code: (cause as { code?: string }).code,
            errno: (cause as { errno?: number }).errno,
          })
        : String(cause)
      : 'sin causa';
    diag(
      `FATAL: signIn cuenta servicio desktop falló: ${authErr.message}. ` +
      `Causa: ${causeText}. Sin sesión válida, no podemos reservar printed_at (RLS 014).`,
    );
    sendStatus(win, 'disconnected');
    return;
  }
  diag('autenticado como cuenta de servicio del desktop');

  // Telemetría remota: heartbeat + sink de logs + canal de comandos. Reutiliza
  // este mismo cliente autenticado. Idempotente: en reconexiones solo refresca
  // las closures (getClient lee la `supabase` vigente).
  startTelemetry({
    getClient: () => supabase,
    getSnapshot: telemetrySnapshot,
    getCacheDump: telemetryCacheDump,
    getPrinters: telemetryPrinters,
  });

  sendStatus(win, 'connecting');

  // ── Carga inicial ──────────────────────────────────────────────────────────
  await loadInitialOrders(win);
  await loadMaintenance(win);

  // ── Suscripción Realtime de orders ─────────────────────────────────────────
  diag('subscribe: enviando join al canal garum_desktop');
  channel = supabase
    .channel('garum_desktop')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      payload => {
        diag('postgres_changes:', payload.eventType, (payload.new as Order)?.id);
        handleChange(payload.new as Order, win);
      },
    )
    .subscribe((status, err) => {
      diag('subscribe[orders] callback: status=', status, 'err=', err?.message ?? 'null');
      if (status === 'SUBSCRIBED') {
        retryDelay = 5000;
        retryCount = 0;
        sendStatus(win, 'connected');
        scheduleMidnightRollover(win);
        startReconciler();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        sendStatus(win, 'disconnected');
        scheduleReconnect();
      }
      // CLOSED no dispara reconexión: phoenix-channels tiene rejoinTimer propio
      // que vuelve a unirse al canal sin recrear el cliente.
      else if (status === 'CLOSED') {
        sendStatus(win, 'disconnected');
      }
    });

  // ── Suscripción Realtime de settings (modo mantenimiento) ──────────────────
  settingsChannel = supabase
    .channel('garum_desktop_settings')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settings' },
      () => { void loadMaintenance(win); },
    )
    .subscribe(status => {
      diag('subscribe[settings] callback: status=', status);
    });

  // ── Suscripción Realtime de comandos (telemetría on-demand) ────────────────
  // El admin inserta una fila en desktop_commands; aquí la recibimos y la
  // ejecutamos (whitelist de solo-lectura). Filtramos por nuestro device_id
  // para no procesar comandos de otros locales.
  const deviceId = getDeviceId();
  commandsChannel = supabase
    .channel('garum_desktop_commands')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'desktop_commands',
        filter: `device_id=eq.${deviceId}`,
      },
      payload => {
        void executeCommand(payload.new as DesktopCommand);
      },
    )
    .subscribe(status => {
      diag('subscribe[commands] callback: status=', status);
    });

  // Drenar comandos que llegaron mientras estábamos desconectados/cerrados.
  void drainPendingCommands();
}

// ─── Telemetría: estado y comandos ────────────────────────────────────────────

function telemetrySnapshot(): HeartbeatSnapshot {
  let unprinted = 0;
  let pending = 0;
  for (const o of orders.values()) {
    const stillPending =
      o.staff_status_kitchen === 'pending' || o.staff_status_bar === 'pending';
    if (stillPending) {
      pending++;
      if (o.printed_at == null) unprinted++;
    }
  }
  return {
    connection_status: currentStatus,
    retry_count: retryCount,
    cache_size: orders.size,
    unprinted_count: unprinted,
    pending_count: pending,
  };
}

function telemetryCacheDump(): CacheDumpRow[] {
  return [...orders.values()].map(o => ({
    id: o.id,
    table_number: o.table_number,
    payment_status: o.payment_status,
    staff_status_kitchen: o.staff_status_kitchen,
    staff_status_bar: o.staff_status_bar,
    printed_at: o.printed_at,
    created_at: o.created_at,
  }));
}

function telemetryPrinters(): TelemetryPrinter[] {
  const { printers } = loadConfig();
  return printers.map(p => ({
    label: p.label,
    destination: p.destination,
    adapter: p.adapter,
    host: p.host,
    port: p.port,
    printerName: p.printerName,
  }));
}

async function drainPendingCommands(): Promise<void> {
  if (!supabase) return;
  try {
    const deviceId = getDeviceId();
    const { data } = await supabase
      .from('desktop_commands')
      .select('*')
      .eq('device_id', deviceId)
      .eq('status', 'pending');
    for (const cmd of (data ?? []) as DesktopCommand[]) {
      void executeCommand(cmd);
    }
  } catch (e) {
    diag('drainPendingCommands error:', e instanceof Error ? e.message : String(e));
  }
}

export async function stopRealtimeListener(): Promise<void> {
  cancelReconnect();
  if (midnightTimer) { clearTimeout(midnightTimer); midnightTimer = null; }
  stopReconciler();
  stopTelemetry();
  await teardownChannels();
  supabase    = null;
  savedUrl    = '';
  savedKey    = '';
  savedWin    = null;
  retryDelay  = 5000;
  orders.clear();
}

async function teardownChannels(): Promise<void> {
  if (channel && supabase) {
    try { await supabase.removeChannel(channel); } catch { /* ignorar */ }
  }
  channel = null;
  if (settingsChannel && supabase) {
    try { await supabase.removeChannel(settingsChannel); } catch { /* ignorar */ }
  }
  settingsChannel = null;
  if (commandsChannel && supabase) {
    try { await supabase.removeChannel(commandsChannel); } catch { /* ignorar */ }
  }
  commandsChannel = null;
}

/**
 * Reaplica la configuración: cierra canales, levanta nuevos con las
 * credenciales actuales. Útil cuando el usuario las cambia en Settings.
 */
export async function reconnect(win: BrowserWindow): Promise<void> {
  const cfg = loadConfig();
  await stopRealtimeListener();
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    await startRealtimeListener(cfg.supabaseUrl, cfg.supabaseKey, win);
  } else {
    sendStatus(win, 'disconnected');
  }
}

// ─── Carga de datos ──────────────────────────────────────────────────────────

/**
 * Conjunto autoritativo de pedidos que deben estar en el panel, leído de la
 * DB vía REST (NO depende del WebSocket Realtime): paid de hoy + paid de días
 * anteriores que sigan pendientes en algún destino (no servidos). Compartido
 * por la carga inicial y por el reconciliador.
 */
async function fetchAuthoritative(): Promise<Order[]> {
  const startToday = startOfTodayMadridIso();
  const todays = await fetchPaged(
    q => q.eq('payment_status', 'paid').gte('created_at', startToday),
  );
  const stalePending = await fetchPaged(
    q => q
      .eq('payment_status', 'paid')
      .lt('created_at', startToday)
      .or('staff_status_kitchen.eq.pending,staff_status_bar.eq.pending'),
  );
  return [...todays, ...stalePending];
}

async function loadInitialOrders(win: BrowserWindow): Promise<void> {
  if (!supabase) return;
  diag('fetch inicial: query desde', startOfTodayMadridIso());

  const all = await fetchAuthoritative();

  orders.clear();
  all.forEach(o => orders.set(o.id, o));
  diag('cache poblado con', orders.size, 'pedidos. Enviando ORDERS_INIT.');
  win.webContents.send(IPC.ORDERS_INIT, [...orders.values()]);

  // Imprimir lo que aún no se imprimió (caso "se reabrió la app después de
  // que llegara el pedido"). printed_at IS NULL, solo pedidos de hoy.
  const unprinted = all.filter(o => o.printed_at == null && isToday(o.created_at));
  if (unprinted.length > 0) {
    diag('arrancando impresión de', unprinted.length, 'pedidos no impresos');
    void reprintMissed(unprinted);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

async function fetchPaged(
  build: (q: QueryBuilder) => QueryBuilder,
): Promise<Order[]> {
  if (!supabase) return [];
  const out: Order[] = [];
  let from = 0;
  for (let i = 0; i < 20; i++) { // tope defensivo de 10k filas
    const baseQ = supabase.from('orders').select('*');
    const res = await build(baseQ)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (res.error) {
      console.error('[Realtime] fetchPaged error:', res.error.message);
      break;
    }
    const rows = (res.data ?? []) as Order[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += rows.length;
  }
  return out;
}

async function reprintMissed(list: Order[]): Promise<void> {
  if (!supabase) return;
  const { printers } = loadConfig();
  if (printers.length === 0) return;
  // Misma ruta que pedidos nuevos: reserva + cola por dispositivo + libera
  // en fallo. Encadenamos secuencialmente para no saturar el spooler al
  // arrancar con varios pedidos pendientes.
  for (const order of list) {
    await reservePrintAndDispatch(order);
  }
}

async function loadMaintenance(win: BrowserWindow): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['maintenance_enabled', 'maintenance_message']);
  const map = new Map((data ?? []).map(r => [r.key as string, r.value as string]));
  const next: MaintenanceState = {
    enabled: (map.get('maintenance_enabled') ?? 'false') === 'true',
    message: map.get('maintenance_message') ?? '',
  };
  if (
    next.enabled !== currentMaintenance.enabled ||
    next.message !== currentMaintenance.message
  ) {
    currentMaintenance = next;
    win.webContents.send(IPC.MAINTENANCE_CHANGED, next);
  }
}

// ─── Reconexión con backoff exponencial ───────────────────────────────────────

function scheduleReconnect(): void {
  if (retryTimer || !savedUrl || !savedWin) return;
  // Reconexión PERSISTENTE: nunca se abandona. Antes parábamos tras 10
  // intentos (~6 min) y la app quedaba muerta hasta reiniciar — cualquier
  // pedido durante esa ventana se perdía. Ahora seguimos reintentando con
  // backoff hasta tope de 60 s indefinidamente. Además, el reconciliador
  // (REST, independiente del WS) sigue recuperando pedidos aunque el canal
  // Realtime esté caído, así que la pérdida queda acotada al peor caso de
  // RECONCILE_MS de retraso.
  retryCount++;
  diag(`[Realtime] Reintento ${retryCount} en ${retryDelay / 1000}s… (reconexión persistente)`);
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!savedWin || savedWin.isDestroyed() || !savedUrl) return;
    await teardownChannels();
    retryDelay = Math.min(retryDelay * 2, 60_000);
    await startRealtimeListener(savedUrl, savedKey, savedWin);
  }, retryDelay);
}

function cancelReconnect(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  retryDelay = 5000;
  retryCount = 0;
}

// ─── Cambios en tiempo real ───────────────────────────────────────────────────

function handleChange(order: Order, win: BrowserWindow): void {
  if (!order?.id) return;

  // Pedidos cancelados → quitar del cache si estaba.
  if (order.payment_status === 'cancelled') {
    if (orders.has(order.id)) {
      orders.delete(order.id);
      win.webContents.send(IPC.ORDERS_REMOVED, order.id);
    }
    return;
  }

  // Solo nos interesan pagados (pending no entra en panel).
  if (order.payment_status !== 'paid') return;

  // Aceptamos el pedido si:
  //   - es de hoy (Madrid), o
  //   - es anterior pero sigue pendiente en algún destino (no perdemos
  //     pedidos sin servir al cruzar medianoche)
  const stillPending =
    order.staff_status_kitchen === 'pending' ||
    order.staff_status_bar === 'pending';
  if (!isToday(order.created_at) && !stillPending) {
    // Día anterior y completado → no aplicar (queda en historial)
    return;
  }

  const isNew = !orders.has(order.id);
  orders.set(order.id, order);
  win.webContents.send(IPC.ORDERS_NEW, order);

  // Notificación + impresión solo si es la primera vez que vemos el pedido
  // y NO está ya impreso. printed_at se reserva con UPDATE atómico para
  // evitar que dos instancias del desktop dupliquen el ticket.
  if (isNew && order.printed_at == null && stillPending) {
    updateTrayStatus('new-order');
    notify(order);
    setTimeout(() => updateTrayStatus('connected'), 8000);
    void reservePrintAndDispatch(order);
  }
}

/**
 * Marcas en memoria de pedidos cuya impresión está en curso, para evitar
 * que el poller redispare un job sobre un id que ya tiene una promesa viva.
 * NO sustituye a la reserva en DB (que cubre el caso multi-instancia);
 * complementa el caso del poller-vs-Realtime dentro del mismo proceso.
 */
const inFlightPrints = new Set<string>();

async function reservePrintAndDispatch(order: Order): Promise<void> {
  if (!supabase) return;
  // Dedup en memoria: si ya hay un job vivo para este order, no lanzamos
  // otro. Cubre el caso reconciliador-vs-handleChange en el mismo proceso.
  if (inFlightPrints.has(order.id)) return;
  // Totalmente impreso (todas las impresoras OK) → nada que hacer.
  if (order.printed_at != null) return;

  const allPrinters = loadConfig().printers;
  if (allPrinters.length === 0) {
    diag('[Realtime] reservePrint: sin impresoras configuradas (loadConfig vacía).');
    return;
  }

  // ── Idempotencia POR IMPRESORA (H4) ──────────────────────────────────────
  // Solo intentamos las impresoras que aún NO imprimieron OK este pedido
  // (no están en printed_targets). Así un fallo de barra NO reimprime cocina
  // en cada ciclo del reconciliador: cocina ya consta y se salta.
  const done = (order.printed_targets ?? {}) as Record<string, string>;
  const pending = allPrinters.filter(p => !done[p.id]);

  if (pending.length === 0) {
    // Todas constan impresas pero printed_at sin fijar (se cayó el último
    // UPDATE) → consolidamos printed_at de forma idempotente.
    const nowIso = new Date().toISOString();
    await supabase.from('orders')
      .update({ printed_at: nowIso })
      .eq('id', order.id)
      .is('printed_at', null);
    const cached = orders.get(order.id);
    if (cached) orders.set(order.id, { ...cached, printed_at: nowIso });
    return;
  }

  inFlightPrints.add(order.id);
  try {
    const results = await printOrder(order, pending);
    const okIds  = results.filter(r => r.ok).map(r => r.id);
    const failed = results.filter(r => !r.ok);

    if (okIds.length > 0) {
      // Registramos las impresoras OK en printed_targets (merge). Si con esto
      // están TODAS las configuradas, fijamos también printed_at.
      const nowIso = new Date().toISOString();
      const nextTargets: Record<string, string> = { ...done };
      for (const id of okIds) nextTargets[id] = nowIso;
      const fullyPrinted = allPrinters.every(p => nextTargets[p.id]);

      const patch: { printed_targets: Record<string, string>; printed_at?: string } = {
        printed_targets: nextTargets,
      };
      if (fullyPrinted) patch.printed_at = nowIso;

      const { error: updErr } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', order.id);
      if (updErr) {
        diag(`[Realtime] error guardando printed_targets orden ${order.id}: ${updErr.message}`);
        // Fallback defensivo: si la columna printed_targets aún no existe
        // (migración 017 sin aplicar), al menos fijamos printed_at en una
        // impresión COMPLETA para no caer en reimpresión en bucle. Degrada al
        // comportamiento previo a H4 (sin granularidad por impresora) en lugar
        // de romperse.
        if (fullyPrinted) {
          const { error: fbErr } = await supabase
            .from('orders')
            .update({ printed_at: nowIso })
            .eq('id', order.id)
            .is('printed_at', null);
          if (!fbErr) {
            const cached = orders.get(order.id);
            if (cached) orders.set(order.id, { ...cached, printed_at: nowIso });
          }
        }
      } else {
        const cached = orders.get(order.id);
        if (cached) orders.set(order.id, { ...cached, ...patch });
      }
    }

    if (failed.length > 0) {
      // NO fijamos printed_at. El reconciliador reintentará SOLO las fallidas
      // (las OK ya están en printed_targets), sin duplicar la impresora sana.
      diag(
        `[Realtime] impresión parcial orden ${order.id} mesa ${order.table_number}: ` +
        `OK=[${okIds.join(',')}] FALLO=[${failed.map(f => f.label).join(',')}]`,
      );
      savedWin?.webContents.send(IPC.PRINT_ERROR, {
        orderId: order.id,
        mesa: order.table_number,
        reason: failed.map(f => `${f.label}: ${f.reason}`).join(' · '),
      });
    }
  } finally {
    inFlightPrints.delete(order.id);
  }
}

// ─── Reconciliación autoritativa ──────────────────────────────────────────────
//
// Cada RECONCILE_MS:
//   1) Re-leemos la DB vía REST (independiente del WebSocket). Esto FUNCIONA
//      aunque el canal Realtime esté caído/reconectando — REST y WS son
//      transportes separados en Supabase.
//   2) Fusionamos en la cache:
//        · pedido en DB que NO está en cache → evento Realtime perdido:
//          lo añadimos, avisamos a la UI (ORDERS_NEW) y lo registramos como
//          BACKFILL_RECOVERED (métrica de cuántos eventos se pierden).
//        · pedido conocido cuyo printed_at/estado cambió → refrescamos (cubre
//          un UPDATE perdido, p.ej. otro staff marcó listo).
//   3) Reintentamos impresión de todo lo pendiente sin imprimir (idempotente
//      vía inFlightPrints + printed_at). Cubre también la impresora intermitente.
//
// Sustituye al antiguo poller, que solo recorría la cache y por tanto era ciego
// a un pedido cuyo evento NEW nunca llegó (la causa raíz de "no entra el pedido").

let reconcileRunning = false;

async function reconcile(): Promise<void> {
  if (!supabase || !savedWin || savedWin.isDestroyed()) return;
  if (reconcileRunning) return; // evita solaparse si una vuelta tarda > RECONCILE_MS
  reconcileRunning = true;
  try {
    let authoritative: Order[];
    try {
      authoritative = await fetchAuthoritative();
    } catch (e) {
      diag('[Reconcile] fetch error:', e instanceof Error ? e.message : String(e));
      return;
    }

    for (const o of authoritative) {
      const known = orders.get(o.id);
      if (!known) {
        // Evento Realtime perdido → recuperado por la DB.
        orders.set(o.id, o);
        savedWin.webContents.send(IPC.ORDERS_NEW, o);
        const stillPending =
          o.staff_status_kitchen === 'pending' || o.staff_status_bar === 'pending';
        const ageS = Math.round((Date.now() - new Date(o.created_at).getTime()) / 1000);
        diag(
          `[Reconcile] BACKFILL_RECOVERED order ${o.id} mesa ${o.table_number} ` +
          `printed=${o.printed_at != null} pending=${stillPending} edad=${ageS}s ` +
          `— evento Realtime perdido, recuperado por reconciliación`,
        );
      } else if (
        known.printed_at !== o.printed_at ||
        known.staff_status_kitchen !== o.staff_status_kitchen ||
        known.staff_status_bar !== o.staff_status_bar ||
        known.payment_status !== o.payment_status
      ) {
        // UPDATE perdido → refrescamos campos relevantes y la UI.
        const merged = { ...known, ...o };
        orders.set(o.id, merged);
        savedWin.webContents.send(IPC.ORDERS_NEW, merged);
      }
    }

    // Reintento de impresión (idempotente).
    const { printers } = loadConfig();
    if (printers.length === 0) return;
    for (const order of orders.values()) {
      if (order.printed_at != null) continue;
      const stillPending =
        order.staff_status_kitchen === 'pending' ||
        order.staff_status_bar === 'pending';
      if (!stillPending) continue;
      if (inFlightPrints.has(order.id)) continue;
      void reservePrintAndDispatch(order);
    }
  } finally {
    reconcileRunning = false;
  }
}

function startReconciler(): void {
  if (reconcileTimer) return;
  reconcileTimer = setInterval(() => { void reconcile(); }, RECONCILE_MS);
}

function stopReconciler(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

export async function markOrderDone(
  id: string,
  destination: 'cocina' | 'barra',
): Promise<void> {
  if (!supabase) throw new Error('Sin conexión');
  const column = destination === 'cocina' ? 'staff_status_kitchen' : 'staff_status_bar';
  const { error } = await supabase
    .from('orders')
    .update({ [column]: 'done' })
    .eq('id', id)
    .eq(column, 'pending');
  if (error) throw new Error(error.message);
}

export function getOrders(): Order[] {
  return [...orders.values()].sort((a, b) => {
    const aDone =
      a.staff_status_kitchen !== 'pending' && a.staff_status_bar !== 'pending';
    const bDone =
      b.staff_status_kitchen !== 'pending' && b.staff_status_bar !== 'pending';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

// ─── Medianoche Madrid ────────────────────────────────────────────────────────

function scheduleMidnightRollover(win: BrowserWindow): void {
  if (midnightTimer) clearTimeout(midnightTimer);
  const ms = msUntilNextMidnightMadrid();
  diag('[Realtime] Próximo cambio de día en', Math.round(ms / 60000), 'min');
  midnightTimer = setTimeout(async () => {
    diag('[Realtime] Cambio de día — refrescando cache');
    if (!supabase || !savedWin || savedWin.isDestroyed()) return;
    await loadInitialOrders(savedWin);
    scheduleMidnightRollover(win);
  }, ms);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendStatus(win: BrowserWindow, status: ConnectionStatus): void {
  diag('sendStatus →', status);
  currentStatus = status;
  updateTrayStatus(status === 'connected' ? 'connected' : 'idle');
  win.webContents.send(IPC.CONNECTION_STATUS, status);
}

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus;
}

export function getMaintenance(): MaintenanceState {
  return currentMaintenance;
}

function notify(order: Order): void {
  try {
    const n = new Notification({
      title: `🍽 Mesa ${order.table_number} — Nuevo pedido`,
      body:  order.items.map(i => `${i.quantity}× ${i.name}`).join('\n'),
      icon:  join(__dirname, '../../resources/icon.png'),
      silent: false,
    });
    n.show();
  } catch {
    // Las notificaciones pueden fallar si el OS no las soporta
  }
}

export function getSupabase() {
  return supabase;
}
