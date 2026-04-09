"use client";

import { CheckCircle, ArrowLeft, UtensilsCrossed } from "lucide-react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { useCart } from "@/context/CartContext";

function SuccessContent() {
  const searchParams = useSearchParams();
  const mesa = searchParams.get('mesa') || '1';
  const { items, totalAmount, clearCart } = useCart();

  const snapshot = useRef({ items: [...items], total: totalAmount });

  useEffect(() => {
    clearCart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { items: orderItems, total: orderTotal } = snapshot.current;

  return (
    <div className="card">
      <img src="/Logo%20garum.png" alt="Garum Vinoteca" className="logo" />

      <div className="check-wrap">
        <CheckCircle size={52} color="#7B4F96" />
      </div>

      <h1 className="serif title">¡Pedido confirmado!</h1>
      <p className="subtitle">Mesa <strong>{mesa}</strong> · Tu comanda ya está en camino.</p>

      {orderItems.length > 0 && (
        <div className="summary">
          <div className="summary-head">
            <UtensilsCrossed size={14} />
            <span>Resumen del pedido</span>
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
            <span>Total pagado</span>
            <strong>{orderTotal.toFixed(2)} €</strong>
          </div>
        </div>
      )}

      <Link href={`/${mesa}`} className="gold-button cta">
        <ArrowLeft size={16} /> Volver a la carta
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
      <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}>
        <SuccessContent />
      </Suspense>
    </main>
  );
}
