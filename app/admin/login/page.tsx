"use client";

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { Lock, Mail, Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Credenciales incorrectas');
      setLoading(false);
      return;
    }

    window.location.href = '/admin';
  };

  return (
    <div className="login-container">
      <div className="login-card glass">
        <div className="login-header">
          <h1 className="gold-text">GARUM</h1>
          <p>Panel de Administración</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="field">
            <Mail size={16} className="field-icon" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <Lock size={16} className="field-icon" />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="gold-button" disabled={loading}>
            {loading ? <Loader2 size={18} className="spin" /> : 'ACCEDER'}
          </button>
        </form>
      </div>

      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--background);
          padding: 2rem;
        }
        .login-card {
          width: 100%;
          max-width: 380px;
          padding: 2.5rem;
          border-radius: 20px;
          border: 1px solid var(--border);
        }
        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .login-header h1 {
          font-size: 2rem;
          margin: 0 0 0.3rem;
        }
        .login-header p {
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .field {
          position: relative;
          display: flex;
          align-items: center;
        }
        .field-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
        }
        .field input {
          width: 100%;
          padding: 0.85rem 1rem 0.85rem 2.5rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .field input:focus {
          border-color: var(--primary);
        }
        .error-msg {
          color: #f87171;
          font-size: 0.85rem;
          text-align: center;
          margin: 0;
        }
        .gold-button {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
