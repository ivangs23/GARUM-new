"use client";

import { CheckCircle, ArrowLeft, UtensilsCrossed } from "lucide-react";
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";

type CartItem = { id: string; name: string; price: number; quantity: number };

function SuccessContent() {
  const searchParams = useSearchParams();
  const mesa = searchParams.get('mesa') || '1';
  const { clearCart } = useCart();
  const { t } = useLanguage();

  // Leer localStorage de forma síncrona antes de que CartProvider lo limpie.
  // useRef no sirve aquí: CartProvider carga items en useEffect (asíncrono),
  // así que en el primer render items = []. El lazy initializer de useState
  // se ejecuta en el mismo tick del primer render, antes de cualquier useEffect.
  const [snapshot] = useState<{ items: CartItem[]; total: number }>(() => {
    try {
      const saved = localStorage.getItem('garum-cart');
      if (saved) {
        const items: CartItem[] = JSON.parse(saved);
        const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        return { items, total };
      }
    } catch { /* carrito corrupto — nada que mostrar */ }
    return { items: [], total: 0 };
  });

  useEffect(() => {
    clearCart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { items: orderItems, total: orderTotal } = snapshot;

  return (
    <div className="card">
      <Image
        src="/Logo%20garum.png"
        alt="Garum Vinoteca"
        className="logo"
        width={786}
        height={472}
        style={{ width: '130px', height: 'auto', display: 'block', margin: '0 auto' }}
        priority
      />

      <div className="check-wrap">
        <CheckCircle size={52} color="#7B4F96" />
      </div>

      <h1 className="serif title">{t('success.title')}</h1>
      <p className="subtitle">
        {t('success.tablePrefix')} <strong>{mesa}</strong> · {t('success.enRoute')}
      </p>

      {orderItems.length > 0 && (
        <div className="summary">
          <div className="summary-head">
            <UtensilsCrossed size={14} />
            <span>{t('success.orderSummary')}</span>
          </div>
          <ul className="items">
            {orderItems.map((item, i) => (
              <li key={i} className="item-row">
                <span className="qty">{item.quantity}×</span>
                <span className="name">{item.name}</span>
                <span className="price">{(item.price * item.quantity).toFixed(2)} €</span>
              </li>
            ))}
          </ul>
          <div className="total-row">
            <span>{t('success.totalPaid')}</span>
            <strong>{orderTotal.toFixed(2)} €</strong>
          </div>
        </div>
      )}

      <Link href={`/${mesa}`} className="gold-button cta">
        <ArrowLeft size={16} /> {t('success.backToMenu')}
      </Link>

      <style jsx>{`
        .card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border-radius: 20px;
          border: 1px solid var(--border);
          box-shadow: 0 4px 30px rgba(0,0,0,0.08);
          padding: 2rem 1.8rem 2.2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
        }
        .logo {
          width: 130px;
          height: auto;
        }
        .check-wrap {
          animation: pop 0.5s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes pop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .title {
          font-size: 1.7rem;
          margin: 0;
          color: var(--text);
          line-height: 1.2;
        }
        .subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin: 0;
        }
        .summary {
          width: 100%;
          background: var(--background);
          border-radius: 12px;
          padding: 1rem 1.1rem;
          text-align: left;
        }
        .summary-head {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin-bottom: 0.7rem;
        }
        .items {
          list-style: none;
          padding: 0; margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .item-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.88rem;
        }
        .qty   { color: var(--primary); font-weight: 700; min-width: 20px; }
        .name  { flex: 1; color: var(--text); }
        .price { color: var(--text-muted); font-size: 0.82rem; white-space: nowrap; }
        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border);
          font-size: 0.9rem;
          color: var(--text-muted);
        }
        .total-row strong { font-size: 1.05rem; color: var(--primary); }
        .cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          margin-top: 0.3rem;
        }
      `}</style>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>…</p>}>
        <SuccessContent />
      </Suspense>
    </main>
  );
}
