import { useState, useEffect, useRef, useCallback } from 'react';
import type { Order } from '../../../shared/types';

const PAGE_SIZE = 50;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD UTC; agrupación aproximada que basta para listar
}

function HistoryCard({ order }: { order: Order }) {
  const time = new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const isCancelled = order.payment_status === 'cancelled';
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
      opacity: isCancelled ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>Mesa {order.table_number}</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--muted)' }}>{time}</span>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {order.items.map((it, i) => (
          <li key={i} style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{it.quantity}×</span> {it.name}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
        <span>{isCancelled ? 'Cancelado' : `Total ${order.total_amount.toFixed(2)} €`}</span>
      </div>
    </div>
  );
}

export default function History() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(async (currentOffset: number) => {
    if (loading || !hasMore) return;
    setLoading(true);
    const page = await window.api.listHistory(PAGE_SIZE, currentOffset);
    setOrders(prev => [...prev, ...page]);
    setOffset(currentOffset + page.length);
    if (page.length < PAGE_SIZE) setHasMore(false);
    setLoading(false);
  }, [loading, hasMore]);

  useEffect(() => {
    loadPage(0);
    // intencional: solo en mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadPage(offset);
    }, { rootMargin: '200px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [offset, loadPage]);

  // Agrupación por día
  const grouped = orders.reduce<Record<string, Order[]>>((acc, o) => {
    const k = dayKey(o.created_at);
    (acc[k] = acc[k] ?? []).push(o);
    return acc;
  }, {});
  const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Historial</h2>

      {orders.length === 0 && !loading && (
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
          Sin pedidos antiguos
        </div>
      )}

      {dayKeys.map(k => (
        <section key={k} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{
            fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--muted)', marginBottom: '0.6rem', borderBottom: '1px solid var(--border)',
            paddingBottom: '0.3rem',
          }}>
            {dayLabel(grouped[k][0].created_at)}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {grouped[k].map(o => <HistoryCard key={o.id} order={o} />)}
          </div>
        </section>
      ))}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loading && <div style={{ color: 'var(--muted)', textAlign: 'center', fontSize: '0.85rem' }}>Cargando...</div>}
    </div>
  );
}
