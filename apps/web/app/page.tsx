"use client";

import { Wine, Coffee, Utensils } from "lucide-react";
import Link from 'next/link';
import Image from 'next/image';
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

      {/* Franja lila superior */}
      <div className="top-band" />


<header className="header">
        <div className="logo-wrap" onClick={handleLogoClick} style={{ cursor: 'default' }}>
          <Image
            src="/Logo%20garum.png"
            alt="Garum Vinoteca"
            className="brand-logo"
            width={786}
            height={472}
            style={{ width: '200px', height: 'auto', display: 'block', margin: '0 auto' }}
            priority
          />
        </div>
        <div className="divider" />
      </header>

      <section className="hero">
        <h2 className="hero-title serif">
          Una experiencia <em>única</em> en tu mesa.
        </h2>
        <p className="hero-subtitle">
          Escanea el código QR de tu mesa y disfruta de nuestra selección de vinos, tapas y café de especialidad.
        </p>
        <Link href="/1" className="gold-button hero-cta">
          VER CARTA COMPLETA
        </Link>
      </section>

      <div className="features-grid">
        {[
          { Icon: Wine,     title: 'Vinos Seleccionados', desc: 'Los mejores caldos de nuestra región y el mundo, elegidos con mimo.' },
          { Icon: Utensils, title: 'Tapas Gourmet',       desc: 'Gastronomía de autor diseñada para compartir momentos únicos.' },
          { Icon: Coffee,   title: 'Café de Especialidad',desc: 'Tostado maestro preparado por baristas expertos.' },
        ].map(({ Icon, title, desc }) => (
          <div key={title} className="feature-card">
            <div className="feature-icon-wrap">
              <Icon size={26} strokeWidth={1.5} color="#7B4F96" />
            </div>
            <h3 className="serif">{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>

      {/* Pie — banda verde que evoca el suelo del local */}
      <footer className="site-footer">
        <span className="serif footer-name">Garum Vinoteca</span>
      </footer>

      <style jsx>{`
        .main-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: transparent;
          position: relative;
        }

/* Banda lila superior */
        .top-band {
          width: 100%;
          height: 5px;
          background: var(--primary);
        }

        /* Header con el logo — fondo blanco */
        .header, .hero, .features-grid, .site-footer {
          position: relative;
          z-index: 1;
        }
        .header {
          text-align: center;
          padding: 1.6rem 2rem 1.4rem;
          width: 100%;
          background: var(--surface);
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }
        .logo-wrap { margin-bottom: 0; }
        .brand-logo {
          width: 160px;
          height: auto;
          display: block;
          margin: 0 auto;
        }
        .divider {
          width: 50px;
          height: 1px;
          background: var(--primary);
          margin: 1rem auto 0;
          opacity: 0.4;
        }

        .hero {
          text-align: center;
          max-width: 680px;
          padding: 2.5rem 2.5rem 2.5rem;
          margin: 2rem 1.5rem;
          background: var(--surface);
          border-radius: 16px;
          box-shadow: 0 2px 20px rgba(0,0,0,0.06);
        }
        .hero-title {
          font-size: 2.2rem;
          line-height: 1.25;
          margin-bottom: 1.2rem;
          color: var(--text);
          font-weight: 700;
        }
        .hero-title em {
          font-style: italic;
          color: var(--primary);
        }
        .hero-subtitle {
          font-size: 1rem;
          color: var(--text-muted);
          line-height: 1.75;
          margin-bottom: 2.5rem;
          max-width: 440px;
          margin-left: auto;
          margin-right: auto;
        }
        .hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          letter-spacing: 0.12em;
          border-radius: 4px;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.2rem;
          width: 100%;
          max-width: 900px;
          padding: 1rem 2rem 5rem;
        }
        .feature-card {
          background: var(--surface);
          padding: 2rem 1.6rem;
          border-radius: 10px;
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
          border: 1px solid var(--border);
        }
        .feature-card h3 {
          font-size: 1rem;
          margin-bottom: 0.6rem;
          color: var(--text);
          letter-spacing: 0.02em;
        }
        .feature-card p {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.65;
        }

        /* Pie */
        .site-footer {
          margin-top: auto;
          width: 100%;
          background: var(--primary);
          padding: 1.4rem 2rem;
          text-align: center;
        }
        .footer-name {
          color: rgba(255,255,255,0.85);
          font-size: 0.95rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        @media (max-width: 600px) {
          .brand-logo { width: 180px; }
          .hero-title { font-size: 1.75rem; }
        }
      `}</style>
    </main>
  );
}
