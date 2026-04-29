import { useState, useEffect } from 'react';
import type { AppConfig, PrinterConfig, DiscoveredPrinter } from '../../../shared/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function newPrinter(overrides: Partial<PrinterConfig> = {}): PrinterConfig {
  return {
    id:          crypto.randomUUID(),
    label:       'Nueva impresora',
    destination: 'cocina',
    adapter:     'escpos-tcp',
    host:        '',
    port:        9100,
    printerName: '',
    ...overrides,
  };
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Settings({ onSaved: _onSaved }: { onSaved: () => void }) {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [autoLaunch,  setAutoLaunch]  = useState(true);
  const [scanSubnet,  setScanSubnet]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    window.api.getConfig().then(cfg => {
      setPrinters(cfg.printers);
      setSupabaseUrl(cfg.supabaseUrl ?? '');
      setSupabaseKey(cfg.supabaseKey ?? '');
      setAutoLaunch(cfg.autoLaunch ?? true);
      setScanSubnet(cfg.scanSubnet ?? '');
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.api.saveConfig({
        printers,
        supabaseUrl: supabaseUrl.trim(),
        supabaseKey: supabaseKey.trim(),
        autoLaunch,
        scanSubnet: scanSubnet.trim(),
      });
      // Si las credenciales cambiaron, reconectar el listener de Realtime.
      await window.api.reconnect();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const addPrinter    = (p: PrinterConfig) => setPrinters(ps => [...ps, p]);
  const updatePrinter = (p: PrinterConfig) => setPrinters(ps => ps.map(x => x.id === p.id ? p : x));
  const deletePrinter = (id: string)       => setPrinters(ps => ps.filter(p => p.id !== id));

  return (
    <div style={{ padding: '2rem', maxWidth: 640, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '2rem' }}>Configuración</h1>

      {/* ── Conexión Supabase ── */}
      <ConnectionSection
        url={supabaseUrl}     onUrlChange={setSupabaseUrl}
        key_={supabaseKey}    onKeyChange={setSupabaseKey}
        autoLaunch={autoLaunch} onAutoLaunchChange={setAutoLaunch}
        scanSubnet={scanSubnet} onScanSubnetChange={setScanSubnet}
      />

      {/* ── Impresoras ── */}
      <PrintersSection
        printers={printers}
        onAdd={addPrinter}
        onUpdate={updatePrinter}
        onDelete={deletePrinter}
      />

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          background:   saved ? 'rgba(74,222,128,.15)' : 'var(--primary)',
          color:        saved ? 'var(--green)' : '#fff',
          border:       saved ? '1px solid rgba(74,222,128,.4)' : 'none',
          borderRadius: 10, padding: '0.75rem 2rem',
          fontSize: '0.9rem', fontWeight: 600,
          opacity: saving ? 0.6 : 1, transition: 'all 0.2s',
          cursor: saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
      </button>
    </div>
  );
}

// ── Sección credenciales Supabase ─────────────────────────────────────────────

function ConnectionSection({
  url, onUrlChange, key_, onKeyChange,
  autoLaunch, onAutoLaunchChange,
  scanSubnet, onScanSubnetChange,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  key_: string;
  onKeyChange: (v: string) => void;
  autoLaunch: boolean;
  onAutoLaunchChange: (v: boolean) => void;
  scanSubnet: string;
  onScanSubnetChange: (v: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={sectionTitle}>Conexión Supabase</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: '-0.5rem', marginBottom: '0.85rem' }}>
        El panel se conecta a la base de datos del restaurante para recibir
        los pedidos pagados. Si no rellenas estos campos, la app arranca sin
        conexión.
      </p>

      <Field label="URL del proyecto">
        <input
          style={inputStyle}
          placeholder="https://xxxxx.supabase.co"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
        />
      </Field>

      <Field label="Anon key">
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            type={showKey ? 'text' : 'password'}
            placeholder="eyJhbGci..."
            value={key_}
            onChange={e => onKeyChange(e.target.value)}
          />
          <button
            type="button"
            style={{ ...ghostBtn, padding: '0.45rem 0.7rem' }}
            onClick={() => setShowKey(s => !s)}
          >
            {showKey ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <Field label="Subred a escanear (opcional)">
          <input
            style={inputStyle}
            placeholder="192.168.1"
            value={scanSubnet}
            onChange={e => onScanSubnetChange(e.target.value)}
          />
        </Field>
        <Field label="Iniciar con Windows">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0' }}>
            <input
              type="checkbox"
              checked={autoLaunch}
              onChange={e => onAutoLaunchChange(e.target.checked)}
            />
            <span style={{ fontSize: '0.85rem' }}>Auto-arranque al iniciar sesión</span>
          </label>
        </Field>
      </div>
    </section>
  );
}

// ── Sección impresoras ────────────────────────────────────────────────────────

type TestState = 'idle' | 'testing' | 'ok' | 'error';

function PrintersSection({
  printers, onAdd, onUpdate, onDelete,
}: {
  printers: PrinterConfig[];
  onAdd:    (p: PrinterConfig) => void;
  onUpdate: (p: PrinterConfig) => void;
  onDelete: (id: string) => void;
}) {
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [scanning,   setScanning]   = useState<'idle' | 'windows' | 'network'>('idle');
  const [scanMsg,    setScanMsg]     = useState('');
  const [testStates, setTestStates]  = useState<Record<string, TestState>>({});

  const handleListWindows = async () => {
    setScanning('windows'); setScanMsg(''); setDiscovered([]);
    try {
      const result = await window.api.listWindowsPrinters();
      setDiscovered(result);
      if (result.length === 0) setScanMsg('No se encontraron impresoras Windows instaladas.');
    } catch {
      setScanMsg('Error al consultar impresoras Windows.');
    } finally {
      setScanning('idle');
    }
  };

  const handleScanNetwork = async () => {
    setScanning('network'); setScanMsg('Escaneando subredes 192.168.0/1 y 10.0.0…'); setDiscovered([]);
    try {
      const result = await window.api.scanNetworkPrinters();
      setDiscovered(result);
      setScanMsg(result.length === 0 ? 'No se encontraron impresoras en red (puerto 9100).' : '');
    } catch {
      setScanMsg('Error al escanear la red.');
    } finally {
      setScanning('idle');
    }
  };

  const handleAddDiscovered = (d: DiscoveredPrinter) => {
    if (d.type === 'windows') {
      onAdd(newPrinter({ adapter: 'windows', printerName: d.name ?? '', label: d.name ?? 'Impresora Windows' }));
    } else {
      onAdd(newPrinter({ adapter: 'escpos-tcp', host: d.host ?? '', port: d.port ?? 9100, label: `TCP ${d.host}` }));
    }
  };

  const handleTest = async (printer: PrinterConfig) => {
    setTestStates(s => ({ ...s, [printer.id]: 'testing' }));
    try {
      await window.api.testPrinter(printer);
      setTestStates(s => ({ ...s, [printer.id]: 'ok' }));
    } catch (err) {
      console.error('[Printer test]', err);
      setTestStates(s => ({ ...s, [printer.id]: 'error' }));
    } finally {
      setTimeout(() => setTestStates(s => ({ ...s, [printer.id]: 'idle' })), 5000);
    }
  };

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={sectionTitle}>Impresoras</h2>

      {/* Botones de descubrimiento */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button style={ghostBtn} disabled={scanning !== 'idle'} onClick={handleListWindows}>
          {scanning === 'windows' ? 'Buscando...' : 'Listar impresoras Windows'}
        </button>
        <button style={ghostBtn} disabled={scanning !== 'idle'} onClick={handleScanNetwork}>
          {scanning === 'network' ? 'Escaneando red...' : 'Buscar en red (9100)'}
        </button>
      </div>

      {scanMsg && (
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{scanMsg}</p>
      )}

      {/* Lista de descubiertas */}
      {discovered.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, marginBottom: '1rem', overflow: 'hidden',
        }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', padding: '0.5rem 0.75rem 0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Encontradas — pulsa + para añadir
          </p>
          {discovered.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0.75rem',
              borderTop: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '0.85rem' }}>
                {d.type === 'windows' ? `🖨 ${d.name}` : `🌐 ${d.host}:${d.port}`}
              </span>
              <button
                style={{ ...ghostBtn, padding: '0.2rem 0.65rem', fontSize: '0.78rem' }}
                onClick={() => handleAddDiscovered(d)}
              >
                + Añadir
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Impresoras configuradas */}
      {printers.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          No hay impresoras configuradas todavía.
        </p>
      )}

      {printers.map(p => (
        <PrinterRow
          key={p.id}
          printer={p}
          testState={testStates[p.id] ?? 'idle'}
          onChange={onUpdate}
          onDelete={() => onDelete(p.id)}
          onTest={() => handleTest(p)}
        />
      ))}

      <button style={{ ...ghostBtn, marginTop: '0.5rem' }} onClick={() => onAdd(newPrinter())}>
        + Nueva impresora
      </button>
    </section>
  );
}

// ── Fila de impresora individual ──────────────────────────────────────────────

function PrinterRow({
  printer, testState, onChange, onDelete, onTest,
}: {
  printer:   PrinterConfig;
  testState: TestState;
  onChange:  (p: PrinterConfig) => void;
  onDelete:  () => void;
  onTest:    () => void;
}) {
  const set = <K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) =>
    onChange({ ...printer, [key]: value });

  const testColor =
    testState === 'ok'      ? 'var(--green)' :
    testState === 'error'   ? 'var(--red)'   :
    testState === 'testing' ? 'var(--muted)' : 'var(--text)';

  const testLabel =
    testState === 'ok'      ? '✓ OK'         :
    testState === 'error'   ? '✗ Error'      :
    testState === 'testing' ? 'Probando...'  : 'Probar';

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      padding: '1rem', marginBottom: '0.75rem', background: 'var(--surface)',
    }}>
      {/* Cabecera: label + test + delete */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Etiqueta (ej. Cocina, Barra)"
          value={printer.label}
          onChange={e => set('label', e.target.value)}
        />
        <button
          style={{ ...ghostBtn, color: testColor, minWidth: 90 }}
          disabled={testState === 'testing'}
          onClick={onTest}
        >
          {testLabel}
        </button>
        <button
          style={{ ...ghostBtn, color: 'var(--red)', padding: '0.35rem 0.6rem' }}
          onClick={onDelete}
          title="Eliminar impresora"
        >
          ✕
        </button>
      </div>

      {/* Destino + Adaptador */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Field label="Destino">
          <select style={inputStyle} value={printer.destination}
            onChange={e => set('destination', e.target.value as PrinterConfig['destination'])}>
            <option value="cocina">Cocina</option>
            <option value="barra">Barra</option>
            <option value="all">Todos</option>
          </select>
        </Field>
        <Field label="Tipo de conexión">
          <select style={inputStyle} value={printer.adapter}
            onChange={e => set('adapter', e.target.value as PrinterConfig['adapter'])}>
            <option value="escpos-tcp">Red / TCP (ESC/POS)</option>
            <option value="windows">Controlador Windows</option>
          </select>
        </Field>
      </div>

      {/* Parámetros según adaptador */}
      {printer.adapter === 'escpos-tcp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
          <Field label="IP de la impresora">
            <input style={inputStyle} placeholder="192.168.1.100"
              value={printer.host ?? ''}
              onChange={e => set('host', e.target.value)} />
          </Field>
          <Field label="Puerto">
            <input style={inputStyle} type="number" placeholder="9100"
              value={printer.port ?? 9100}
              onChange={e => set('port', parseInt(e.target.value, 10) || 9100)} />
          </Field>
        </div>
      )}

      {printer.adapter === 'windows' && (
        <Field label="Nombre de impresora (Windows)">
          <input style={inputStyle} placeholder="EPSON TM-T20III"
            value={printer.printerName ?? ''}
            onChange={e => set('printerName', e.target.value)} />
        </Field>
      )}
    </div>
  );
}

// ── Componentes y estilos compartidos ─────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{
        display: 'block', fontSize: '0.7rem', color: 'var(--muted)',
        marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.8rem', boxSizing: 'border-box',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 7, color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
};

const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 7, padding: '0.45rem 0.9rem',
  color: 'var(--text)', fontSize: '0.82rem', cursor: 'pointer',
  transition: 'border-color 0.15s',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', marginBottom: '1rem', paddingBottom: '0.5rem',
  borderBottom: '1px solid var(--border)',
};
