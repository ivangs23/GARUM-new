import { BrowserWindow, Notification } from 'electron';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { setDefaultResultOrder } from 'dns';
import { join } from 'path';
import { updateTrayStatus } from './tray';
import { loadConfig } from './config';
import { printOrder } from './printer';
import {
  IPC,
  type Order,
  type ConnectionStatus,
  type MaintenanceState,
} from '../shared/types';
import { diag } from './diag';
import { startOfTodayMadridIso, isToday, msUntilNextMidnightMadrid } from '@garum/shared/format';

// En el local del cliente undici hacía happy-eyeballs y elegía AAAA
// contra *.supabase.co; la red no tiene IPv6 outbound y el auth de
// Supabase rechazaba con un escueto "fetch failed" sin causa visible
// (Realtime usa ws + family:0 y no sufría el mismo problema).
// Aplicamos la prioridad IPv4 a nivel de proceso para que TODO consumo
// de DNS dentro del main process (Supabase auth, electron-updater,
// cualquier fetch futuro) prefiera la A sobre la AAAA.
setDefaultResultOrder('ipv4first');

let supabase: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let settingsChannel: RealtimeChannel | null = null;

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
let printPollTimer: ReturnType<typeof setInterval> | null = null;
let retryDelay = 5000; // ms — se duplica en cada fallo, máx 60 s
let retryCount = 0;
const MAX_RETRIES = 10; // tras 10 intentos fallidos deja de reconectar
const PRINT_POLL_MS = 10_000; // safety net: cada 10 s reintentamos pedidos sin imprimir

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
  // Wrap fetch para volcar al log la causa real antes de que el SDK
  // de Supabase envuelva el error y solo nos llegue "fetch failed".
  const debugFetch: typeof fetch = async (input, init) => {
    const target = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    try {
      const res = await fetch(input, init);
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
        startPrintPoller();
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
}

export async function stopRealtimeListener(): Promise<void> {
  cancelReconnect();
  if (midnightTimer) { clearTimeout(midnightTimer); midnightTimer = null; }
  stopPrintPoller();
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

async function loadInitialOrders(win: BrowserWindow): Promise<void> {
  if (!supabase) return;
  const startToday = startOfTodayMadridIso();
  diag('fetch inicial: query desde', startToday);

  // 1) pedidos paid de hoy (paginado por seguridad)
  const todays = await fetchPaged(
    q => q.eq('payment_status', 'paid').gte('created_at', startToday),
  );
  // 2) pedidos pendientes de días anteriores (no servidos)
  const stalePending = await fetchPaged(
    q => q
      .eq('payment_status', 'paid')
      .lt('created_at', startToday)
      .or('staff_status_kitchen.eq.pending,staff_status_bar.eq.pending'),
  );

  orders.clear();
  [...todays, ...stalePending].forEach(o => orders.set(o.id, o));
  diag('cache poblado con', orders.size, 'pedidos. Enviando ORDERS_INIT.');
  win.webContents.send(IPC.ORDERS_INIT, [...orders.values()]);

  // 3) imprimir lo que aún no se imprimió (caso "se reabrió la app
  //    después de que llegara el pedido"). printed_at IS NULL.
  const unprinted = todays.filter(o => o.printed_at == null);
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
  if (retryCount >= MAX_RETRIES) {
    diag('[Realtime] Máximo de reintentos alcanzado. Conexión abandonada.');
    sendStatus(savedWin, 'disconnected');
    return;
  }
  retryCount++;
  diag(`[Realtime] Reintento ${retryCount}/${MAX_RETRIES} en ${retryDelay / 1000}s…`);
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
  if (inFlightPrints.has(order.id)) return;
  const { printers } = loadConfig();
  if (printers.length === 0) {
    diag('[Realtime] reservePrint: sin impresoras configuradas (loadConfig vacía).');
    return;
  }

  // Reserva: marca printed_at = ahora SOLO si seguía NULL. Si otra instancia
  // (otro POS abierto) ya lo reservó, .select() devuelve vacío y salimos.
  const { data, error } = await supabase
    .from('orders')
    .update({ printed_at: new Date().toISOString() })
    .eq('id', order.id)
    .is('printed_at', null)
    .select('id');
  if (error) {
    // Antes solo se logueaba a console.error (sin volcado a fichero diag),
    // así que en producción los fallos de RLS (típicos cuando la cuenta de
    // servicio del desktop no está embebida en el build → se cae a anon →
    // policy de UPDATE bloquea) eran invisibles en el log. Lo subimos a
    // diag + lo propagamos al renderer como PRINT_ERROR para que el
    // operador vea un banner en vez de silencio.
    diag(`[Realtime] error reservando print orden ${order.id}: ${error.message}`);
    savedWin?.webContents.send(IPC.PRINT_ERROR, {
      orderId: order.id,
      mesa: order.table_number,
      reason: `Reserva BD: ${error.message}`,
    });
    return;
  }
  if (!data || data.length === 0) {
    diag(`[Realtime] reserva sin filas para orden ${order.id} — ya estaba impresa o sin permisos.`);
    return;
  }

  inFlightPrints.add(order.id);
  try {
    const failures = await printOrder(order, printers);
    if (failures.length === 0) return;

    // Si CUALQUIER impresora aplicable al pedido falló, liberar reserva para
    // reintentar en el siguiente poll. Asumimos que el ticket es idempotente
    // a nivel humano (un cocinero ve dos tickets iguales y cocina una vez).
    // Mejor reimprimir de más que perder un pedido.
    await supabase.from('orders').update({ printed_at: null }).eq('id', order.id);
    // Refleja en cache la liberación para que el poller lo vea.
    const cached = orders.get(order.id);
    if (cached) orders.set(order.id, { ...cached, printed_at: null });

    savedWin?.webContents.send(IPC.PRINT_ERROR, {
      orderId: order.id,
      mesa: order.table_number,
      reason: failures.map(f => `${f.label}: ${f.reason}`).join(' · '),
    });
  } finally {
    inFlightPrints.delete(order.id);
  }
}

// ─── Polling fallback (impresión) ─────────────────────────────────────────────
//
// Cada PRINT_POLL_MS revisamos la cache: pedidos con algún destino pendiente
// y `printed_at IS NULL` se reenvían a `reservePrintAndDispatch`. Cubre:
//   - Carrera entre `handleChange` y la reserva en DB (otra instancia).
//   - Liberaciones de printed_at tras fallo de impresora intermitente.
//   - Eventos Realtime perdidos (red caída + reconexión sin replay).

function startPrintPoller(): void {
  if (printPollTimer) return;
  printPollTimer = setInterval(() => {
    if (!savedWin || savedWin.isDestroyed()) return;
    const { printers } = loadConfig();
    if (printers.length === 0) return;
    for (const order of orders.values()) {
      if (order.printed_at != null) continue;
      const stillPending =
        order.staff_status_kitchen === 'pending' ||
        order.staff_status_bar === 'pending';
      if (!stillPending) continue;
      if (inFlightPrints.has(order.id)) continue;
      diag(`[Realtime] poll-retry print orden ${order.id} mesa ${order.table_number}`);
      void reservePrintAndDispatch(order);
    }
  }, PRINT_POLL_MS);
}

function stopPrintPoller(): void {
  if (printPollTimer) {
    clearInterval(printPollTimer);
    printPollTimer = null;
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
