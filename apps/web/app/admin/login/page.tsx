"use client";

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { Lock, Mail, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
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

    router.push('/admin');
  };

  return (
    <div className="login-container">
      <Link href="/" className="back-link">
        <ArrowLeft size={18} />
        <span>Volver a la web</span>
      </Link>

      <div className="login-card">
        <div className="login-header">
          <Image
            src="/Logo%20garum.png"
            alt="Garum Vinoteca"
            className="login-logo"
            width={120}
            height={120}
            priority
          />
          <p className="subtitle serif">Panel de Administración</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="field-group">
            <label>Usuario / Email</label>
            <div className="field">
              <Mail size={18} className="field-icon" />
              <input
                type="email"
                placeholder="admin@garum.es"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="field-group">
            <label>Contraseña</label>
            <div className="field">
              <Lock size={18} className="field-icon" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <Loader2 size={18} className="spin" /> : 'ACCEDER AL PANEL'}
          </button>
        </form>
      </div>

      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--background);
          padding: 2rem;
          position: relative;
        }

        .back-link {
          position: absolute;
          top: 2rem;
          left: 2rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: var(--text-muted);
          font-size: 0.9rem;
          transition: all 0.2s;
          text-decoration: none;
        }
        .back-link:hover {
          color: var(--primary);
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 3.5rem 2.8rem;
          border-radius: 24px;
          border: 1px solid var(--border);
          background: #fff;
          box-shadow: 0 20px 50px rgba(44, 24, 16, 0.08);
        }

        .login-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }
        .login-logo {
          width: 160px;
          height: auto;
          display: block;
          margin: 0 auto 0.6rem;
        }
        .subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          letter-spacing: 0.05em;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .field-group label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          padding-left: 0.2rem;
        }

        .field {
          position: relative;
          display: flex;
          align-items: center;
        }
        .field-icon {
          position: absolute;
          left: 1.2rem;
          color: #ccc;
          transition: color 0.2s;
        }
        .field input {
          width: 100%;
          padding: 1rem 1rem 1rem 3.2rem;
          background: #fafafa;
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--text);
          font-size: 1rem;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .field input:focus {
          border-color: var(--primary);
          background: #fff;
          box-shadow: 0 0 0 4px var(--primary-light);
        }
        .field input:focus + :global(.field-icon) {
          color: var(--primary);
        }

        .error-msg {
          color: #dc2626;
          font-size: 0.85rem;
          text-align: center;
          margin: 0;
          font-weight: 500;
        }

        .login-btn {
          margin-top: 1rem;
          height: 56px;
          background: var(--primary);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-weight: 800;
          font-size: 0.95rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: var(--accent-shadow);
        }

        .login-btn:hover {
          background: var(--primary-hover);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(123, 79, 150, 0.3);
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
