import { BrowserWindow, Notification } from 'electron';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { join } from 'path';
import { updateTrayStatus } from './tray';
import { loadConfig } from './config';
import { printOrder } from './printer';
import { IPC, type Order, type ConnectionStatus } from '../shared/types';
import { startOfTodayMadridIso, isToday, msUntilNextMidnightMadrid } from './today';

let supabase: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;

// Cache de pedidos activos en memoria
const orders = new Map<string, Order>();

// Estado de reconexión
let savedUrl  = '';
let savedKey  = '';
let savedWin: BrowserWindow | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 5000; // ms — se duplica en cada fallo, máx 60 s

// ─── Conexión ────────────────────────────────────────────────────────────────

export async function startRealtimeListener(
  url: string,
  key: string,
  win: BrowserWindow,
): Promise<void> {
  // Guardar para reconexión automática
  savedUrl = url;
  savedKey = key;
  savedWin = win;

  supabase = createClient(url, key);

  sendStatus(win, 'connecting');

  // Carga inicial de pedidos de HOY (paid, sea cual sea staff_status)
  const startToday = startOfTodayMadridIso();
  let data: Order[] | null = null;
  let error: { message: string } | null = null;
  try {
    const res = await supabase
      .from('orders')
      .select('*')
      .eq('payment_status', 'paid')
      .gte('created_at', startToday)
      .order('created_at', { ascending: true })
      .limit(200);
    data = res.data as Order[] | null;
    error = res.error;
  } catch (e) {
    console.error('[Realtime] EXCEPCIÓN en fetch inicial:', e);
    sendStatus(win, 'disconnected');
    scheduleReconnect();
    return;
  }

  if (error) {
    console.error('[Realtime] Error cargando pedidos iniciales:', error.message);
    sendStatus(win, 'disconnected');
    return;
  }

  orders.clear();
  (data ?? []).forEach(o => orders.set(o.id, o));
  win.webContents.send(IPC.ORDERS_INIT, [...orders.values()]);

  // Suscripción Realtime
  channel = supabase
    .channel('garum_desktop')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      payload => handleChange(payload.new as Order, win),
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        retryDelay = 5000; // reset backoff al conectar con éxito
        sendStatus(win, 'connected');
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        sendStatus(win, 'disconnected');
        scheduleReconnect();
      }
    });
}

export function stopRealtimeListener(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (channel && supabase) {
    try { supabase.removeChannel(channel); } catch { /* ignorar */ }
    channel = null;
  }
  supabase    = null;
  savedUrl    = '';
  savedKey    = '';
  savedWin    = null;
  retryDelay  = 5000;
  orders.clear();
}

// ─── Reconexión con backoff exponencial ───────────────────────────────────────

function scheduleReconnect(): void {
  if (retryTimer || !savedUrl || !savedWin) return;
  console.log(`[Realtime] Reintentando conexión en ${retryDelay / 1000}s…`);
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!savedWin || savedWin.isDestroyed() || !savedUrl) return;
    // Limpiar canal anterior antes de reconectar
    if (channel && supabase) {
      try { supabase.removeChannel(channel); } catch { /* ignorar */ }
      channel = null;
    }
    retryDelay = Math.min(retryDelay * 2, 60_000);
    await startRealtimeListener(savedUrl, savedKey, savedWin);
  }, retryDelay);
}

// ─── Cambios en tiempo real ───────────────────────────────────────────────────

function handleChange(order: Order, win: BrowserWindow): void {
  if (!order?.id) return;

  const isActive = order.payment_status === 'paid' && order.staff_status !== 'done';

  if (isActive) {
    const isNew = !orders.has(order.id);
    orders.set(order.id, order);
    win.webContents.send(IPC.ORDERS_NEW, order);

    if (isNew) {
      updateTrayStatus('new-order');
      notify(order);
      setTimeout(() => updateTrayStatus('connected'), 8000);

      // Imprimir en las impresoras configuradas (sin bloquear el flujo)
      const { printers } = loadConfig();
      if (printers.length > 0) {
        printOrder(order, printers).catch(err =>
          console.error('[Realtime] Error al imprimir:', err),
        );
      }
    }
  } else {
    orders.delete(order.id);
    win.webContents.send(IPC.ORDERS_REMOVED, order.id);
  }
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

export async function markOrderDone(id: string): Promise<void> {
  if (!supabase) return;
  orders.delete(id);
  const { error } = await supabase
    .from('orders')
    .update({ staff_status: 'done' })
    .eq('id', id);
  if (error) console.error('[Realtime] Error marcando como listo:', error.message);
}

export function getOrders(): Order[] {
  return [...orders.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendStatus(win: BrowserWindow, status: ConnectionStatus): void {
  updateTrayStatus(status === 'connected' ? 'connected' : 'idle');
  win.webContents.send(IPC.CONNECTION_STATUS, status);
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

/** Devuelve la instancia activa de Supabase (puede ser null si aún no conectado). */
export function getSupabase() {
  return supabase;
}
