import { useState, useEffect, useCallback } from 'react';
import type { Order, OrderItem } from '../../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterItems(items: OrderItem[], dest: 'cocina' | 'barra'): OrderItem[] {
  return items.filter(item => {
    if (item.destination) return item.destination === dest;
    // Fallback para pedidos legacy sin campo destination
    const barraKw = ['vino', 'cerveza', 'café', 'copa', 'cóctel', 'agua', 'refresco'];
    const isBarra = barraKw.some(kw => item.name.toLowerCase().includes(kw));
    return dest === 'barra' ? isBarra : !isBarra;
  });
}

function useElapsed(created_at: string): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(created_at).getTime()) / 1000);
      if (secs < 60)   setElapsed(`${secs}s`);
      else if (secs < 3600) setElapsed(`${Math.floor(secs / 60)}m ${secs % 60}s`);
      else setElapsed(`${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [created_at]);

  return elapsed;
}

// ─── Tarjeta de pedido ────────────────────────────────────────────────────────

function OrderCard({ order, dest, onDone }: {
  order: Order;
  dest: 'cocina' | 'barra';
  onDone: (id: string) => void;
}) {
  const elapsed  = useElapsed(order.created_at);
  const items    = filterItems(order.items, dest);
  const secs     = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
  const isUrgent = secs > 600;

  return (
    <div style={{
      background: isUrgent ? '#1a0f0f' : 'var(--surface)',
      border: `1px solid ${isUrgent ? 'rgba(239,68,68,.5)' : 'var(--border)'}`,
      borderRadius: 14, padding: '1rem', display: 'flex', flexDirection: 'column',
      gap: '0.75rem', animation: 'slideIn 0.25s ease',
    }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          background: 'var(--primary)', color: '#fff',
          padding: '0.25rem 0.75rem', borderRadius: 6,
          fontWeight: 900, fontSize: '1.1rem',
        }}>
          MESA {order.table_number}
        </span>
        <span style={{ fontSize: '0.78rem', color: isUrgent ? 'var(--red)' : 'var(--muted)', fontFamily: 'monospace', fontWeight: isUrgent ? 700 : 400 }}>
          ⏱ {elapsed}
        </span>
      </div>

      {/* Ítems */}
      <ul style={{ listStyle: 'none', borderTop: '1px solid var(--border)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontFamily: 'monospace', fontSize: '0.9rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 700, minWidth: 24 }}>{item.quantity}×</span>
            <span>{item.name}</span>
          </li>
        ))}
      </ul>

      {/* Acciones */}
      <button
        onClick={() => onDone(order.id)}
        style={{
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
    </div>
  );
}

// ─── Columna ──────────────────────────────────────────────────────────────────

function Column({ dest, orders, onDone }: {
  dest: 'cocina' | 'barra';
  orders: Order[];
  onDone: (id: string) => void;
}) {
  const active = orders.filter(o => filterItems(o.items, dest).length > 0);

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
          {active.length}
        </span>
      </div>

      {/* Pedidos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>
        {active.map(o => (
          <OrderCard key={o.id + dest} order={o} dest={dest} onDone={onDone} />
        ))}
        {active.length === 0 && (
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
    // Carga inicial
    window.api.getOrders().then(setOrders);

    // Eventos en tiempo real
    window.api.onOrdersInit(setOrders);
    window.api.onNewOrder(upsert);
    window.api.onOrderRemoved(remove);

    return () => {
      window.api.off('orders:init');
      window.api.off('orders:new');
      window.api.off('orders:removed');
    };
  }, [upsert, remove]);

  const markDone = async (id: string) => {
    remove(id);
    await window.api.markDone(id);
  };

  const total = orders.length;

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

      {/* Columnas */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem',
        padding: '1rem 1.5rem', overflowY: 'auto',
      }}>
        <Column dest="cocina" orders={orders} onDone={markDone} />
        <Column dest="barra"  orders={orders} onDone={markDone} />
      </div>
    </div>
  );
}
