"use client";

import { Wine, Coffee, Utensils } from "lucide-react";
import Link from 'next/link';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    if (clicks.current >= 5) {
      clicks.current = 0;
      router.push('/admin/login');
      return;
    }
    timer.current = setTimeout(() => { clicks.current = 0; }, 1500);
  };

  return (
    <main className="main-container">

      {/* Franja burdeos decorativa superior */}
      <div className="top-band" />

      <header className="header">
        <div className="logo-wrap" onClick={handleLogoClick} style={{ cursor: 'default' }}>
          <h1 className="brand-title gold-text">GARUM</h1>
          <p className="brand-sub serif">Vinoteca &amp; Cocina</p>
        </div>
        <div className="divider" />
      </header>

      <section className="hero">
        <h2 className="hero-title serif">
          Una experiencia <span className="gold-text">exclusiva</span> en tu mesa.
        </h2>
        <p className="hero-subtitle">
          Escanea el código QR de tu mesa y comienza a disfrutar de la mejor selección de vinos, tapas y café de especialidad.
        </p>
        <Link href="/1" className="gold-button hero-cta">
          VER CARTA COMPLETA
        </Link>
      </section>

      <div className="features-grid">
        {[
          { Icon: Wine,     title: 'Cava Seleccionada',  desc: 'Los mejores caldos de nuestra región y el mundo elegidos con mimo.' },
          { Icon: Utensils, title: 'Tapas Gourmet',      desc: 'Gastronomía de autor diseñada para compartir momentos únicos.' },
          { Icon: Coffee,   title: 'Café de Especialidad', desc: 'Tostado maestro preparado por baristas expertos.' },
        ].map(({ Icon, title, desc }) => (
          <div key={title} className="feature-card">
            <div className="feature-icon-wrap">
              <Icon size={28} color="#7B1D2E" />
            </div>
            <h3 className="serif">{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>

      {/* Franja burdeos decorativa inferior */}
      <div className="bottom-band" />

      <style jsx>{`
        .main-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--background);
          position: relative;
          overflow: hidden;
        }

        /* Bandas burdeos que imitan el zócalo del edificio */
        .top-band {
          width: 100%;
          height: 6px;
          background: var(--primary);
        }
        .bottom-band {
          width: 100%;
          height: 60px;
          background: var(--primary);
          margin-top: auto;
        }

        .header {
          text-align: center;
          padding: 3rem 2rem 2rem;
          width: 100%;
          max-width: 600px;
        }
        .logo-wrap { margin-bottom: 1rem; }
        .brand-title {
          font-size: 3.5rem;
          letter-spacing: 0.18em;
          line-height: 1;
          margin: 0;
        }
        .brand-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
          letter-spacing: 0.25em;
          text-transform: uppercase;
          margin-top: 0.4rem;
        }
        .divider {
          width: 60px;
          height: 2px;
          background: var(--primary);
          margin: 1.5rem auto 0;
        }

        .hero {
          text-align: center;
          max-width: 680px;
          padding: 3rem 2rem;
        }
        .hero-title {
          font-size: 2.4rem;
          line-height: 1.2;
          margin-bottom: 1.2rem;
          color: var(--text);
        }
        .hero-subtitle {
          font-size: 1.05rem;
          color: var(--text-muted);
          line-height: 1.7;
          margin-bottom: 2.5rem;
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }
        .hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          letter-spacing: 0.1em;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          width: 100%;
          max-width: 960px;
          padding: 0 2rem 4rem;
        }
        .feature-card {
          background: var(--surface);
          padding: 2rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          text-align: center;
          box-shadow: var(--card-shadow);
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          border-color: var(--primary);
          box-shadow: var(--accent-shadow);
        }
        .feature-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: var(--primary-light);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.2rem;
          border: 1px solid rgba(123,29,46,0.15);
        }
        .feature-card h3 {
          font-size: 1.1rem;
          margin-bottom: 0.6rem;
          color: var(--text);
        }
        .feature-card p {
          font-size: 0.88rem;
          color: var(--text-muted);
          line-height: 1.6;
        }

        @media (max-width: 600px) {
          .brand-title { font-size: 2.8rem; }
          .hero-title { font-size: 1.8rem; }
        }
      `}</style>
    </main>
  );
}
