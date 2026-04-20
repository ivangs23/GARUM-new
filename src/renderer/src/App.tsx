import { useState, useEffect } from 'react';
import Orders  from './pages/Orders';
import Settings from './pages/Settings';

type Page = 'orders' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('orders');
  const [status, setStatus] = useState<string>('connecting');

  useEffect(() => {
    window.api.onConnectionStatus(s => setStatus(s));
    return () => window.api.off('connection:status');
  }, []);

  const statusColor: Record<string, string> = {
    connected:    'var(--green)',
    disconnected: 'var(--red)',
    connecting:   'var(--barra)',
  };

  const statusLabel: Record<string, string> = {
    connected:    'En línea',
    disconnected: 'Sin conexión',
    connecting:   'Conectando...',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* Sidebar */}
      <aside style={{
        width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '1rem 0',
      }}>
        {/* Logo + título */}
        <div style={{ padding: '0 1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.1em' }}>GARUM</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>Panel de Comandas</div>
        </div>

        {/* Navegación */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {([['orders', '🍽 Comandas'], ['settings', '⚙️ Configuración']] as [Page, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                display: 'block', width: '100%', padding: '0.7rem 1.2rem',
                textAlign: 'left', background: page === p ? 'rgba(123,79,150,0.15)' : 'none',
                border: 'none', borderLeft: page === p ? '3px solid var(--primary)' : '3px solid transparent',
                color: page === p ? 'var(--text)' : 'var(--muted)',
                fontSize: '0.88rem', fontWeight: page === p ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Estado de conexión */}
        <div style={{
          padding: '0.75rem 1.2rem', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor[status] ?? 'var(--muted)',
            animation: status === 'connected' ? 'pulse 2s infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {statusLabel[status] ?? status}
          </span>
        </div>
      </aside>

      {/* Contenido */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {page === 'orders' ? <Orders /> : <Settings onSaved={() => setPage('orders')} />}
      </main>
    </div>
  );
}
