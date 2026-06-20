"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import {
  Activity, RefreshCw, Terminal, Loader2, Wifi, WifiOff,
  Printer, AlertTriangle, CheckCircle2,
} from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type PrinterInfo = {
  label: string; destination: string; adapter: string;
  host?: string; port?: number; printerName?: string;
};
type HeartbeatRow = {
  device_id: string;
  app_version: string | null;
  connection_status: string | null;
  retry_count: number;
  cache_size: number;
  unprinted_count: number;
  pending_count: number;
  printers: PrinterInfo[];
  os: string | null;
  uptime_s: number | null;
  updated_at: string;
};
type LogRow = {
  id: number; device_id: string; level: string; event: string;
  order_id: string | null; data: unknown; created_at: string;
};
type CommandRow = {
  id: number; device_id: string; command: string;
  status: string; result: unknown; requested_at: string; completed_at: string | null;
};

type Props = { initialHeartbeats: HeartbeatRow[]; initialLogs: LogRow[] };

// Heartbeat cada 30s; lo damos por "vivo" si lo vimos hace < 75s.
const STALE_MS = 75_000;
const COMMANDS = [
  { id: 'ping',             label: 'Ping',                 hint: 'Comprueba que el local responde ahora mismo' },
  { id: 'tail_log',         label: 'Últimas líneas de log', hint: 'Vuelca los últimos ~60 KB de garum-diag.log' },
  { id: 'dump_cache',       label: 'Volcar cache de pedidos', hint: 'Pedidos en memoria con sus estados' },
  { id: 'dump_print_queue', label: 'Cola de impresión',    hint: 'Pedidos sin imprimir + impresoras' },
  { id: 'dump_config',      label: 'Configuración',        hint: 'Config redactada (sin la key de Supabase)' },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  return `hace ${Math.floor(s / 86400)}d`;
}
function uptime(s: number | null): string {
  if (s == null) return '—';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
function levelColor(level: string): string {
  if (level === 'error') return '#dc2626';
  if (level === 'warn') return '#d97706';
  return '#64748b';
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function HealthClient({ initialHeartbeats, initialLogs }: Props) {
  const [beats, setBeats] = useState<Record<string, HeartbeatRow>>(
    () => Object.fromEntries(initialHeartbeats.map(h => [h.device_id, h])),
  );
  const [logs, setLogs] = useState<LogRow[]>(initialLogs);
  const [now, setNow] = useState<number>(() => Date.now());
  const [levelFilter, setLevelFilter] = useState<'all' | 'warn' | 'error'>('all');
  const [search, setSearch] = useState('');

  // Estado del runner de comandos
  const [device, setDevice] = useState<string>(initialHeartbeats[0]?.device_id ?? '');
  const [command, setCommand] = useState<string>('ping');
  const [running, setRunning] = useState(false);
  const [cmdError, setCmdError] = useState('');
  const [result, setResult] = useState<CommandRow | null>(null);
  const pendingId = useRef<number | null>(null);
  const cmdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const devices = useMemo(() => Object.values(beats).sort(
    (a, b) => a.device_id.localeCompare(b.device_id),
  ), [beats]);

  // Dispositivo efectivo: el elegido a mano, o el primero que haya. Derivado
  // (no sincronizado por effect) para no disparar renders en cascada.
  const effectiveDevice = device || devices[0]?.device_id || '';

  // Ticker para refrescar "hace Xs" y la frescura del heartbeat.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  // Suscripciones Realtime: heartbeat, logs, comandos (para recibir resultados).
  useEffect(() => {
    const ch = supabase
      .channel('admin_health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desktop_heartbeat' },
        payload => {
          const row = payload.new as HeartbeatRow;
          if (row?.device_id) setBeats(prev => ({ ...prev, [row.device_id]: row }));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'desktop_logs' },
        payload => {
          const row = payload.new as LogRow;
          setLogs(prev => [row, ...prev].slice(0, 300));
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'desktop_commands' },
        payload => {
          const row = payload.new as CommandRow;
          if (pendingId.current != null && row.id === pendingId.current && row.status !== 'pending') {
            if (cmdTimeout.current) clearTimeout(cmdTimeout.current);
            pendingId.current = null;
            setRunning(false);
            setResult(row);
          }
        })
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, []);

  const refresh = async () => {
    const [{ data: hb }, { data: lg }] = await Promise.all([
      supabase.from('desktop_heartbeat').select('*').order('updated_at', { ascending: false }),
      supabase.from('desktop_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    if (hb) setBeats(Object.fromEntries((hb as HeartbeatRow[]).map(h => [h.device_id, h])));
    if (lg) setLogs(lg as LogRow[]);
  };

  const runCommand = async () => {
    if (!effectiveDevice) { setCmdError('No hay ningún local seleccionado.'); return; }
    setRunning(true);
    setCmdError('');
    setResult(null);
    const { data, error } = await supabase
      .from('desktop_commands')
      .insert({ device_id: effectiveDevice, command })
      .select()
      .single();
    if (error || !data) {
      setRunning(false);
      setCmdError(error?.message ?? 'No se pudo enviar el comando.');
      return;
    }
    pendingId.current = (data as CommandRow).id;
    // Timeout: si el local no responde en 25s probablemente está cerrado.
    cmdTimeout.current = setTimeout(() => {
      if (pendingId.current != null) {
        pendingId.current = null;
        setRunning(false);
        setCmdError('Sin respuesta del local en 25s. ¿Está la app abierta y conectada?');
      }
    }, 25_000);
  };

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (levelFilter === 'warn' && l.level === 'info') return false;
      if (levelFilter === 'error' && l.level !== 'error') return false;
      if (q && !(`${l.event} ${l.order_id ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [logs, levelFilter, search]);

  const hasData = devices.length > 0;

  return (
    <div className="health-wrap">
      <div className="toolbar">
        <button className="ghost-btn" onClick={refresh}>
          <RefreshCw size={15} /> Refrescar
        </button>
        <span className="live-tag"><span className="live-dot" /> En vivo</span>
      </div>

      {!hasData && (
        <div className="empty">
          <Activity size={20} />
          <div>
            <strong>Sin datos de telemetría todavía.</strong>
            <p>
              Comprueba que la migración <code>016_desktop_telemetry.sql</code> está aplicada en
              Supabase y que hay algún local con la app abierta. El heartbeat tarda hasta 30s en aparecer.
            </p>
          </div>
        </div>
      )}

      {/* ── Tarjetas de locales ── */}
      <div className="devices">
        {devices.map(d => {
          const fresh = now - new Date(d.updated_at).getTime() < STALE_MS;
          const conn = fresh ? (d.connection_status ?? 'unknown') : 'offline';
          const tone =
            conn === 'connected' ? 'ok' :
            conn === 'connecting' ? 'warn' :
            conn === 'offline' ? 'off' : 'bad';
          return (
            <div key={d.device_id} className={`device-card ${tone}`}>
              <div className="device-head">
                <div className="device-status">
                  {conn === 'connected' ? <Wifi size={18} /> :
                   conn === 'offline' ? <WifiOff size={18} /> : <AlertTriangle size={18} />}
                  <div>
                    <p className="device-conn">
                      {conn === 'connected' ? 'Conectado' :
                       conn === 'connecting' ? 'Conectando…' :
                       conn === 'offline' ? 'Sin señal (¿cerrado/dormido?)' : 'Desconectado'}
                    </p>
                    <p className="device-sub">
                      visto {ago(d.updated_at, now)} · v{d.app_version ?? '?'}
                    </p>
                  </div>
                </div>
                {d.unprinted_count > 0 && (
                  <span className="badge-alert">
                    <Printer size={13} /> {d.unprinted_count} sin imprimir
                  </span>
                )}
              </div>

              <div className="device-metrics">
                <div><span>{d.pending_count}</span>pendientes</div>
                <div><span>{d.unprinted_count}</span>sin imprimir</div>
                <div><span>{d.cache_size}</span>en cache</div>
                <div><span>{d.retry_count}</span>reintentos</div>
                <div><span>{uptime(d.uptime_s)}</span>uptime</div>
              </div>

              <div className="device-foot">
                <span className="mono">{d.device_id.slice(0, 8)}…</span>
                <span className="device-os">{d.os ?? ''}</span>
              </div>
              <div className="device-printers">
                {(d.printers ?? []).length === 0
                  ? <span className="no-printers"><AlertTriangle size={12} /> Sin impresoras configuradas</span>
                  : (d.printers ?? []).map((p, i) => (
                      <span key={i} className="printer-chip">
                        {p.label} · {p.destination} · {p.adapter === 'windows' ? p.printerName : `${p.host}:${p.port ?? 9100}`}
                      </span>
                    ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Runner de comandos ── */}
      <div className="panel">
        <div className="panel-title"><Terminal size={16} /> Comandos remotos</div>
        <div className="cmd-row">
          <select value={effectiveDevice} onChange={e => setDevice(e.target.value)} disabled={!hasData}>
            {devices.map(d => (
              <option key={d.device_id} value={d.device_id}>
                {d.device_id.slice(0, 8)}… ({d.os?.split('·').pop()?.trim() ?? d.device_id.slice(0, 8)})
              </option>
            ))}
          </select>
          <select value={command} onChange={e => setCommand(e.target.value)}>
            {COMMANDS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button className="run-btn" onClick={runCommand} disabled={running || !hasData}>
            {running ? <Loader2 size={15} className="spin" /> : <Terminal size={15} />}
            {running ? 'Esperando…' : 'Ejecutar'}
          </button>
        </div>
        <p className="cmd-hint">{COMMANDS.find(c => c.id === command)?.hint}</p>
        {cmdError && <p className="error-msg"><AlertTriangle size={14} /> {cmdError}</p>}
        {result && (
          <div className="cmd-result">
            <div className="cmd-result-head">
              {result.status === 'done'
                ? <CheckCircle2 size={15} color="#16a34a" />
                : <AlertTriangle size={15} color="#dc2626" />}
              {result.command} · {result.status}
            </div>
            <pre>{result.command === 'tail_log'
              ? String((result.result as { text?: string })?.text ?? '')
              : JSON.stringify(result.result, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* ── Logs ── */}
      <div className="panel">
        <div className="panel-title">
          <Activity size={16} /> Eventos recientes
          <div className="log-filters">
            <input
              placeholder="Filtrar (texto o id de pedido)…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {(['all', 'warn', 'error'] as const).map(lv => (
              <button
                key={lv}
                className={`chip ${levelFilter === lv ? 'on' : ''}`}
                onClick={() => setLevelFilter(lv)}
              >
                {lv === 'all' ? 'Todo' : lv === 'warn' ? 'Warn+' : 'Errores'}
              </button>
            ))}
          </div>
        </div>
        <div className="logs">
          {filteredLogs.length === 0 && <p className="logs-empty">Sin eventos que mostrar.</p>}
          {filteredLogs.map(l => (
            <div key={l.id} className="log-line">
              <span className="log-time">{new Date(l.created_at).toLocaleTimeString('es-ES')}</span>
              <span className="log-level" style={{ color: levelColor(l.level) }}>{l.level}</span>
              <span className="log-event">{l.event}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .health-wrap { display: flex; flex-direction: column; gap: 1.25rem; max-width: 980px; }
        .toolbar { display: flex; align-items: center; justify-content: space-between; }
        .ghost-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem;
          background: #fff; border: 1px solid var(--border); border-radius: 10px;
          font-size: 0.83rem; cursor: pointer; color: var(--text); transition: all .2s;
        }
        .ghost-btn:hover { border-color: var(--primary); color: var(--primary); }
        .live-tag { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--text-muted); }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74,222,128,.5);} 70%{box-shadow:0 0 0 6px rgba(74,222,128,0);} 100%{box-shadow:0 0 0 0 rgba(74,222,128,0);} }

        .empty {
          display: flex; gap: 0.8rem; padding: 1.2rem 1.4rem; background: #fffbeb;
          border: 1px solid #fde68a; border-radius: 14px; color: #92400e;
        }
        .empty p { margin: 0.3rem 0 0; font-size: 0.85rem; }
        .empty code { background: #fef3c7; padding: 0.1rem 0.35rem; border-radius: 5px; }

        .devices { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
        .device-card {
          background: #fff; border: 1px solid var(--border); border-radius: 16px;
          padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.8rem;
          box-shadow: var(--card-shadow); border-left-width: 4px;
        }
        .device-card.ok   { border-left-color: #4ade80; }
        .device-card.warn { border-left-color: #fbbf24; }
        .device-card.bad  { border-left-color: #f87171; }
        .device-card.off  { border-left-color: #cbd5e1; }

        .device-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
        .device-status { display: flex; align-items: center; gap: 0.6rem; }
        .device-conn { margin: 0; font-weight: 700; font-size: 0.95rem; }
        .device-sub { margin: 0.1rem 0 0; font-size: 0.76rem; color: var(--text-muted); }
        .badge-alert {
          display: inline-flex; align-items: center; gap: 0.3rem; background: #fef2f2;
          color: #dc2626; border: 1px solid #fecaca; border-radius: 20px;
          padding: 0.2rem 0.55rem; font-size: 0.72rem; font-weight: 700; white-space: nowrap;
        }

        .device-metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.3rem; text-align: center; }
        .device-metrics > div { display: flex; flex-direction: column; font-size: 0.66rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; }
        .device-metrics span { font-size: 1.1rem; font-weight: 800; color: var(--text); font-family: var(--font-serif); }

        .device-foot { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); }
        .mono { font-family: monospace; }
        .device-os { text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
        .device-printers { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .printer-chip { background: var(--primary-light); color: var(--primary); border-radius: 6px; padding: 0.15rem 0.45rem; font-size: 0.7rem; }
        .no-printers { display: inline-flex; align-items: center; gap: 0.3rem; color: #d97706; font-size: 0.74rem; font-weight: 600; }

        .panel { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 1.2rem 1.4rem; box-shadow: var(--card-shadow); }
        .panel-title { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.92rem; margin-bottom: 0.9rem; flex-wrap: wrap; }

        .cmd-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cmd-row select {
          padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 10px;
          font-size: 0.85rem; background: #fff; color: var(--text); cursor: pointer; flex: 1; min-width: 140px;
        }
        .run-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem;
          background: var(--primary); color: #fff; border: none; border-radius: 10px;
          font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all .2s;
        }
        .run-btn:hover:not(:disabled) { background: var(--primary-hover); }
        .run-btn:disabled { opacity: .6; cursor: default; }
        .cmd-hint { font-size: 0.78rem; color: var(--text-muted); margin: 0.5rem 0 0; }

        .cmd-result { margin-top: 0.9rem; }
        .cmd-result-head { display: flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.82rem; margin-bottom: 0.4rem; }
        .cmd-result pre {
          background: #0f172a; color: #e2e8f0; padding: 0.9rem 1rem; border-radius: 10px;
          font-size: 0.74rem; max-height: 360px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0;
        }

        .log-filters { margin-left: auto; display: flex; gap: 0.35rem; align-items: center; }
        .log-filters input { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.78rem; outline: none; }
        .log-filters input:focus { border-color: var(--primary); }
        .chip { padding: 0.35rem 0.7rem; border: 1px solid var(--border); border-radius: 20px; background: #fff; font-size: 0.74rem; cursor: pointer; color: var(--text-muted); }
        .chip.on { background: var(--primary); color: #fff; border-color: var(--primary); }

        .logs { display: flex; flex-direction: column; max-height: 420px; overflow: auto; border-top: 1px solid var(--border); }
        .logs-empty { color: var(--text-muted); font-size: 0.83rem; padding: 1rem 0; }
        .log-line { display: flex; gap: 0.6rem; padding: 0.32rem 0; border-bottom: 1px solid var(--border); font-size: 0.78rem; align-items: baseline; }
        .log-time { color: var(--text-muted); font-family: monospace; flex-shrink: 0; }
        .log-level { text-transform: uppercase; font-weight: 700; font-size: 0.68rem; width: 42px; flex-shrink: 0; }
        .log-event { font-family: monospace; color: var(--text); word-break: break-word; }

        .error-msg { display: flex; align-items: center; gap: 0.35rem; color: #dc2626; font-size: 0.82rem; margin: 0.6rem 0 0; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
