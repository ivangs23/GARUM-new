"use client";

import { useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import { Loader2, Power, Save, AlertTriangle } from 'lucide-react';

type Props = {
  initialEnabled: boolean;
  initialMessage: string;
};

export default function SettingsClient({ initialEnabled, initialMessage }: Props) {
  const [enabled, setEnabled]   = useState(initialEnabled);
  const [message, setMessage]   = useState(initialMessage);
  const [saving, setSaving]     = useState(false);
  const [toggling, setToggling] = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  const handleToggle = async () => {
    setToggling(true);
    setError('');
    const next = !enabled;
    const { error } = await supabase
      .from('settings')
      .update({ value: String(next) })
      .eq('key', 'maintenance_enabled');
    if (error) { setError(error.message); setToggling(false); return; }
    setEnabled(next);
    setToggling(false);
  };

  const handleSaveMessage = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    const { error } = await supabase
      .from('settings')
      .update({ value: message })
      .eq('key', 'maintenance_message');
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="settings-wrap">

      {/* ── Bloque estado de la web ── */}
      <div className={`status-card ${enabled ? 'offline' : 'online'}`}>
        <div className="status-info">
          <div className="status-dot" />
          <div>
            <p className="status-label">Estado de la web</p>
            <p className="status-value">{enabled ? 'FUERA DE SERVICIO' : 'EN LÍNEA'}</p>
          </div>
        </div>
        <button
          className={`toggle-btn ${enabled ? 'btn-restore' : 'btn-shutdown'}`}
          onClick={handleToggle}
          disabled={toggling}
        >
          {toggling
            ? <Loader2 size={16} className="spin" />
            : <Power size={16} />
          }
          {enabled ? 'Restaurar web' : 'Apagar web'}
        </button>
      </div>

      {enabled && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>La web está apagada. Los clientes ven el mensaje de fuera de servicio.</span>
        </div>
      )}

      {/* ── Mensaje editable ── */}
      <div className="message-block">
        <label className="block-label">Mensaje de fuera de servicio</label>
        <p className="block-hint">Se muestra a los clientes cuando la web está apagada.</p>
        <textarea
          className="message-textarea"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={300}
          placeholder="Estamos cerrados temporalmente..."
        />
        <div className="message-footer">
          <span className="char-count">{message.length}/300</span>
          <button className="save-btn" onClick={handleSaveMessage} disabled={saving}>
            {saving
              ? <Loader2 size={15} className="spin" />
              : <Save size={15} />
            }
            {saved ? '¡Guardado!' : 'Guardar mensaje'}
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <style jsx>{`
        .settings-wrap { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; }

        /* Status card */
        .status-card {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.8rem 2rem; border-radius: 20px; border: 1px solid var(--border);
          background: #fff; box-shadow: var(--card-shadow); gap: 1rem; flex-wrap: wrap;
        }
        .status-card.offline { border-color: #f87171; background: #fff5f5; }
        .status-card.online  { border-color: #86efac; background: #f0fdf4; }

        .status-info { display: flex; align-items: center; gap: 1rem; }
        .status-dot {
          width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
        }
        .offline .status-dot { background: #f87171; box-shadow: 0 0 0 4px rgba(248,113,113,0.2); }
        .online  .status-dot { background: #4ade80; box-shadow: 0 0 0 4px rgba(74,222,128,0.2); animation: pulse-dot 2s infinite; }
        @keyframes pulse-dot {
          0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(74,222,128,0); }
          100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
        }

        .status-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin: 0; font-weight: 700; }
        .status-value { font-size: 1.3rem; font-weight: 800; margin: 0.1rem 0 0; color: var(--text); font-family: var(--font-serif); }
        .offline .status-value { color: #dc2626; }
        .online  .status-value { color: #16a34a; }

        .toggle-btn {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1.5rem; border-radius: 12px;
          font-size: 0.88rem; font-weight: 700; cursor: pointer;
          border: none; transition: all 0.2s; letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .btn-shutdown { background: #f87171; color: #fff; box-shadow: 0 4px 15px rgba(248,113,113,0.4); }
        .btn-shutdown:hover:not(:disabled) { background: #ef4444; transform: translateY(-1px); }
        .btn-restore  { background: #4ade80; color: #166534; box-shadow: 0 4px 15px rgba(74,222,128,0.4); }
        .btn-restore:hover:not(:disabled)  { background: #22c55e; transform: translateY(-1px); }
        .toggle-btn:disabled { opacity: 0.6; cursor: default; transform: none; }

        /* Warning */
        .warning-banner {
          display: flex; align-items: center; gap: 0.7rem;
          padding: 1rem 1.2rem; background: #fff7ed; border: 1px solid #fed7aa;
          border-radius: 12px; color: #c2410c; font-size: 0.88rem; font-weight: 500;
        }

        /* Message block */
        .message-block {
          background: #fff; border: 1px solid var(--border); border-radius: 20px;
          padding: 1.8rem 2rem; box-shadow: var(--card-shadow);
          display: flex; flex-direction: column; gap: 0.6rem;
        }
        .block-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin: 0; }
        .block-hint  { font-size: 0.83rem; color: var(--text-muted); margin: 0; }

        .message-textarea {
          width: 100%; padding: 0.9rem 1rem; border: 1px solid var(--border);
          border-radius: 12px; font-size: 0.95rem; color: var(--text);
          background: var(--surface); resize: vertical; outline: none;
          font-family: inherit; transition: border-color 0.2s; box-sizing: border-box;
        }
        .message-textarea:focus { border-color: var(--primary); }

        .message-footer { display: flex; align-items: center; justify-content: space-between; }
        .char-count { font-size: 0.78rem; color: var(--text-muted); }

        .save-btn {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.7rem 1.4rem; background: var(--primary); color: #fff;
          border: none; border-radius: 10px; font-size: 0.85rem; font-weight: 700;
          cursor: pointer; transition: all 0.2s;
        }
        .save-btn:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
        .save-btn:disabled { opacity: 0.6; cursor: default; }

        .error-msg { color: #dc2626; font-size: 0.85rem; font-weight: 500; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
