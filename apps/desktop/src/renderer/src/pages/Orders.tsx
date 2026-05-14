import { useState, useEffect, useCallback, useRef } from 'react';
import type { Order, OrderItem, StaffSubStatus, PrinterConfig } from '../../../shared/types';
import {
  filterItems,
  hasItemsFor,
  type Destination,
} from '@garum/shared/order-routing';
import { PreviewModal } from '../components/PreviewModal';

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useElapsed(created_at: string): string {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(created_at).getTime()) / 1000);
      if (secs < 60)        setElapsed(`${secs}s`);
      else if (secs < 3600) setElapsed(`${Math.floor(secs / 60)}m ${secs % 60}s`);
      else                  setElapsed(`${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [created_at]);
  return elapsed;
}

// ─── Tarjeta de pedido ────────────────────────────────────────────────────────

function OrderCard({ order, dest, onDone, onPreview }: {
  order: Order;
  dest: Destination;
  onDone: (id: string, dest: Destination) => void;
  onPreview: (order: Order) => void;
}) {
  const subStatus: StaffSubStatus =
    dest === 'cocina' ? order.staff_status_kitchen : order.staff_status_bar;
  const isDone   = subStatus === 'done';
  const elapsed  = useElapsed(order.created_at);
  const items: OrderItem[] = filterItems(order.items, dest);
  const secs     = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
  const isUrgent = !isDone && secs > 600;

  return (
    <div
      data-done={isDone ? 'true' : 'false'}
      style={{
        background: isDone ? '#0e0e0e' : isUrgent ? '#1a0f0f' : 'var(--surface)',
        border: `1px solid ${isDone ? 'var(--border)' : isUrgent ? 'rgba(239,68,68,.5)' : 'var(--border)'}`,
        borderRadius: 14, padding: '1rem', display: 'flex', flexDirection: 'column',
        gap: '0.75rem', animation: 'slideIn 0.25s ease',
        opacity: isDone ? 0.5 : 1,
      }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          background: isDone ? 'var(--muted)' : 'var(--primary)', color: '#fff',
          padding: '0.25rem 0.75rem', borderRadius: 6,
          fontWeight: 900, fontSize: '1.1rem',
        }}>
          MESA {order.table_number}
        </span>
        <span style={{
          fontSize: '0.78rem',
          color: isDone ? 'var(--muted)' : isUrgent ? 'var(--red)' : 'var(--muted)',
          fontFamily: 'monospace',
          fontWeight: isUrgent ? 700 : 400,
        }}>
          {isDone ? `✓ ${new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : `⏱ ${elapsed}`}
        </span>
      </div>

      {/* Ítems */}
      <ul style={{ listStyle: 'none', borderTop: '1px solid var(--border)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontFamily: 'monospace', fontSize: '0.9rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: isDone ? 'var(--muted)' : 'var(--primary)', fontWeight: 700, minWidth: 24 }}>{item.quantity}×</span>
            <span>{item.name}</span>
          </li>
        ))}
      </ul>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => onPreview(order)}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            color: '#aaa',
            border: '1px solid #333',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Vista previa
        </button>
        {!isDone && (
          <button
            onClick={() => onDone(order.id, dest)}
            style={{
              flex: 1,
              background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.3)',
              borderRadius: 8, color: 'var(--green)', padding: '0.5rem',
              fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.05em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,222,128,.1)')}
          >
            ✓ LISTO
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Columna ──────────────────────────────────────────────────────────────────

function Column({ dest, orders, onDone, onPreview }: {
  dest: Destination;
  orders: Order[];
  onDone: (id: string, dest: Destination) => void;
  onPreview: (order: Order) => void;
}) {
  const active = orders.filter(o => hasItemsFor(o.items, dest));
  const subStatus = (o: Order): StaffSubStatus =>
    dest === 'cocina' ? o.staff_status_kitchen : o.staff_status_bar;
  const pending = active.filter(o => subStatus(o) === 'pending');
  const done    = active.filter(o => subStatus(o) === 'done');

  const colors = {
    cocina: { bg: 'rgba(251,146,60,.08)', border: 'rgba(251,146,60,.25)', text: '#fb923c' },
    barra:  { bg: 'rgba(212,175,55,.08)',  border: 'rgba(212,175,55,.25)',  text: '#d4af37' },
  };
  const c = colors[dest];
  const icon = dest === 'cocina' ? '🍳' : '🍷';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Cabecera columna */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.75rem 1rem', borderRadius: 10,
        background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      }}>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <h2 style={{ flex: 1, fontSize: '0.9rem', letterSpacing: '0.1em', fontWeight: 700 }}>
          {dest.toUpperCase()}
        </h2>
        <span style={{
          background: 'rgba(255,255,255,.1)', borderRadius: 20,
          padding: '0.1rem 0.5rem', fontSize: '0.8rem', fontWeight: 700,
        }}>
          {pending.length}
        </span>
      </div>

      {/* Pedidos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>
        {pending.map(o => (
          <OrderCard key={o.id + dest} order={o} dest={dest} onDone={onDone} onPreview={onPreview} />
        ))}
        {done.map(o => (
          <OrderCard key={o.id + dest} order={o} dest={dest} onDone={onDone} onPreview={onPreview} />
        ))}
        {pending.length === 0 && done.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '2.5rem 1rem',
            color: 'var(--muted)', fontSize: '0.85rem',
            border: '1px dashed var(--border)', borderRadius: 10,
          }}>
            Sin pedidos pendientes
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const upsert = useCallback((order: Order) => {
    setOrders(prev => {
      const exists = prev.find(o => o.id === order.id);
      return exists
        ? prev.map(o => o.id === order.id ? order : o)
        : [...prev, order];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  useEffect(() => {
    // Audio para nuevos pedidos. Si el archivo no existe, .play() falla
    // en silencio (catch).
    audioRef.current = new Audio('./notification.mp3');
    audioRef.current.preload = 'auto';

    window.api.getOrders().then(setOrders);

    window.api.onOrdersInit(setOrders);
    window.api.onNewOrder(o => {
      // Solo sonido cuando el pedido llega "fresco" (no impreso aún
      // y con algún destino pendiente). Evita sonidos al recargar histórico.
      const fresh = o.printed_at == null && (
        o.staff_status_kitchen === 'pending' || o.staff_status_bar === 'pending'
      );
      upsert(o);
      if (fresh) audioRef.current?.play().catch(() => {});
    });
    window.api.onOrderRemoved(remove);

    return () => {
      window.api.off('orders:init');
      window.api.off('orders:new');
      window.api.off('orders:removed');
      audioRef.current = null;
    };
  }, [upsert, remove]);

  useEffect(() => {
    window.api.getConfig().then((cfg) => setPrinters(cfg.printers));
  }, []);

  /**
   * Marca listo SOLO el destino concreto. Optimistic update con
   * rollback si la BD rechaza el cambio (sin conexión, RLS, etc.).
   */
  const markDone = async (id: string, dest: Destination) => {
    const column = dest === 'cocina' ? 'staff_status_kitchen' : 'staff_status_bar';

    setOrders(curr =>
      curr.map(o => o.id === id ? { ...o, [column]: 'done' as StaffSubStatus } : o),
    );

    try {
      await window.api.markDone({ id, destination: dest });
    } catch (e) {
      console.error('[Orders] markDone failed:', e);
      // Rollback localizado con setState funcional para evitar pisar
      // mutaciones simultáneas si el camarero marca varios pedidos seguidos.
      setOrders(curr =>
        curr.map(o => o.id === id ? { ...o, [column]: 'pending' as StaffSubStatus } : o),
      );
      setError('No se pudo marcar como listo. Revisa la conexión.');
      setTimeout(() => setError(null), 4000);
    }
  };

  const total = orders.filter(o =>
    o.staff_status_kitchen === 'pending' || o.staff_status_bar === 'pending'
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Cabecera */}
      <div style={{
        padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Pedidos activos</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {total === 0 ? 'Todo listo ✓' : `${total} mesa${total > 1 ? 's' : ''} pendiente${total > 1 ? 's' : ''}`}
        </span>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,.12)',
          color: '#f87171',
          borderBottom: '1px solid rgba(239,68,68,.3)',
          padding: '0.55rem 1.5rem',
          fontSize: '0.8rem',
        }}>
          {error}
        </div>
      )}

      {/* Columnas */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem',
        padding: '1rem 1.5rem', overflowY: 'auto',
      }}>
        <Column dest="cocina" orders={orders} onDone={markDone} onPreview={setPreviewOrder} />
        <Column dest="barra"  orders={orders} onDone={markDone} onPreview={setPreviewOrder} />
      </div>

      {previewOrder && (
        <PreviewModal
          order={previewOrder}
          printers={printers}
          onClose={() => setPreviewOrder(null)}
        />
      )}
    </div>
  );
}
