import { useEffect, useState } from 'react';
import { IPC, type UpdaterStatus } from '../../../shared/types';

const NOT_AVAILABLE_AUTOHIDE_MS = 6_000;

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    window.api.getUpdaterStatus().then((s) => {
      if (alive) setStatus(s);
    });
    window.api.onUpdaterStatus((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
      window.api.off(IPC.UPDATER_STATUS);
    };
  }, []);

  // Auto-ocultar el banner "no hay actualizaciones" tras unos segundos.
  // Mantenerlo permanente sería ruido.
  const [hideNotAvailable, setHideNotAvailable] = useState(false);
  useEffect(() => {
    if (status.kind !== 'not-available') {
      setHideNotAvailable(false);
      return;
    }
    const t = setTimeout(() => setHideNotAvailable(true), NOT_AVAILABLE_AUTOHIDE_MS);
    return () => clearTimeout(t);
  }, [status.kind]);

  if (status.kind === 'idle') return null;
  if (status.kind === 'not-available' && hideNotAvailable) return null;

  const styles = bannerStyles(status.kind);

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{styles.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{styles.title(status)}</div>
          {styles.subtitle(status) && (
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{styles.subtitle(status)}</div>
          )}
          {status.kind === 'downloading' && (
            <div
              style={{
                marginTop: 4,
                height: 4,
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, status.percent))}%`,
                  height: '100%',
                  background: 'currentColor',
                  transition: 'width 0.25s ease-out',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {status.kind === 'downloaded' && (
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await window.api.installUpdate();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          style={{
            background: 'rgba(255,255,255,0.95)',
            color: '#15803d',
            border: 'none',
            borderRadius: 4,
            padding: '0.4rem 0.9rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
            flexShrink: 0,
          }}
        >
          Reiniciar e instalar
        </button>
      )}

      {status.kind === 'error' && (
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await window.api.checkForUpdate();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          style={{
            background: 'rgba(255,255,255,0.9)',
            color: '#991b1b',
            border: 'none',
            borderRadius: 4,
            padding: '0.4rem 0.9rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            flexShrink: 0,
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

type StyleKit = {
  container: React.CSSProperties;
  icon: string;
  title: (s: UpdaterStatus) => string;
  subtitle: (s: UpdaterStatus) => string | null;
};

function bannerStyles(kind: UpdaterStatus['kind']): StyleKit {
  const base: React.CSSProperties = {
    padding: '0.55rem 1rem',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderBottom: '1px solid transparent',
  };

  switch (kind) {
    case 'checking':
      return {
        container: { ...base, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderColor: 'rgba(59,130,246,0.4)' },
        icon: '🔄',
        title: () => 'Buscando actualizaciones...',
        subtitle: () => null,
      };
    case 'not-available':
      return {
        container: { ...base, background: 'rgba(100,116,139,0.12)', color: '#64748b', borderColor: 'rgba(100,116,139,0.3)' },
        icon: '✓',
        title: (s) => (s.kind === 'not-available' ? `Estás en la última versión (${s.version})` : ''),
        subtitle: () => null,
      };
    case 'available':
      return {
        container: { ...base, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderColor: 'rgba(59,130,246,0.4)' },
        icon: '⬇',
        title: (s) => (s.kind === 'available' ? `Nueva versión ${s.version} disponible` : ''),
        subtitle: () => 'Preparando descarga...',
      };
    case 'downloading':
      return {
        container: { ...base, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderColor: 'rgba(59,130,246,0.4)' },
        icon: '⬇',
        title: (s) =>
          s.kind === 'downloading'
            ? `Descargando v${s.version || '...'} (${Math.round(s.percent)}%)`
            : '',
        subtitle: (s) =>
          s.kind === 'downloading'
            ? `${formatMB(s.transferred)} MB / ${formatMB(s.total)} MB`
            : null,
      };
    case 'downloaded':
      return {
        container: { ...base, background: 'rgba(34,197,94,0.18)', color: '#15803d', borderColor: 'rgba(34,197,94,0.5)' },
        icon: '✨',
        title: (s) =>
          s.kind === 'downloaded'
            ? `Versión ${s.version} lista para instalar`
            : '',
        subtitle: () => 'Pulsa "Reiniciar e instalar" o se aplicará al cerrar la app.',
      };
    case 'error':
      return {
        container: { ...base, background: 'rgba(239,68,68,0.15)', color: '#991b1b', borderColor: 'rgba(239,68,68,0.4)' },
        icon: '⚠️',
        title: () => 'Error al comprobar actualizaciones',
        subtitle: (s) => (s.kind === 'error' ? s.message : null),
      };
    case 'disabled':
      return {
        container: { ...base, background: 'rgba(100,116,139,0.08)', color: '#64748b', borderColor: 'rgba(100,116,139,0.2)' },
        icon: '🛠',
        title: () => 'Autoupdater desactivado',
        subtitle: (s) => (s.kind === 'disabled' ? s.reason : null),
      };
    default:
      return {
        container: base,
        icon: '',
        title: () => '',
        subtitle: () => null,
      };
  }
}
