import { useState, useEffect } from 'react';
import Orders  from './pages/Orders';
import Settings from './pages/Settings';
import History from './pages/History';
import UpdateBanner from './components/UpdateBanner';
import { IPC, type MaintenanceState } from '../../shared/types';

type Page = 'orders' | 'history' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('orders');
  const [status, setStatus] = useState<string>('connecting');
  const [maintenance, setMaintenance] = useState<MaintenanceState>({
    enabled: false,
    message: '',
  });
  const [appVersion, setAppVersion] = useState<string>('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    // Pull: traer el estado actual al montar (cubre el caso de force-reload,
    // donde el push pasado se perdió porque el renderer aún no estaba listo).
    window.api.getConnectionStatus().then(setStatus);
    window.api.getMaintenance().then(setMaintenance);
    window.api.getAppVersion().then(setAppVersion);
    // Push: recibir cambios futuros.
    window.api.onConnectionStatus(setStatus);
    window.api.onMaintenanceChanged(setMaintenance);
    return () => {
      window.api.off(IPC.CONNECTION_STATUS);
      window.api.off(IPC.MAINTENANCE_CHANGED);
    };
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
          {([
            ['orders',   '🍽 Comandas'],
            ['history',  '📜 Historial'],
            ['settings', '⚙️ Configuración'],
          ] as [Page, string][]).map(([p, label]) => (
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

        {/* Estado de conexión + versión */}
        <div style={{
          padding: '0.75rem 1.2rem', borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
          {appVersion && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.68rem', color: 'var(--muted)', opacity: 0.85,
            }}>
              <span>v{appVersion}</span>
              <button
                onClick={async () => {
                  if (checkingUpdate) return;
                  setCheckingUpdate(true);
                  try {
                    await window.api.checkForUpdate();
                  } finally {
                    setCheckingUpdate(false);
                  }
                }}
                disabled={checkingUpdate}
                title="Buscar actualización"
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  color: 'inherit',
                  fontSize: '0.62rem',
                  padding: '1px 6px',
                  cursor: checkingUpdate ? 'wait' : 'pointer',
                  lineHeight: 1.4,
                }}
              >
                {checkingUpdate ? 'Buscando…' : 'Buscar update'}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Contenido */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <UpdateBanner />
        {maintenance.enabled && (
          <div style={{
            background: 'rgba(251,146,60,0.1)',
            borderBottom: '1px solid rgba(251,146,60,0.4)',
            color: '#fb923c',
            padding: '0.55rem 1rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <span>
              <strong>Modo mantenimiento activo en la web.</strong>{' '}
              {maintenance.message || 'Los nuevos pedidos están deshabilitados. Solo se ven los ya pagados.'}
            </span>
          </div>
        )}
        {page === 'orders'   && <Orders />}
        {page === 'history'  && <History />}
        {page === 'settings' && <Settings onSaved={() => setPage('orders')} />}
      </main>
    </div>
  );
}
