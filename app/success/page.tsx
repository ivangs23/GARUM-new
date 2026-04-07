"use client";

import { CheckCircle, ArrowLeft } from "lucide-react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useCart } from "@/context/CartContext";

function SuccessContent() {
  const searchParams = useSearchParams();
  const mesa = searchParams.get('mesa') || '1';
  const { clearCart } = useCart();

  useEffect(() => {
    // Limpiamos el pedido una vez pagado con éxito
    clearCart();
  }, [clearCart]);

  return (
    <div className="success-card glass">
      <CheckCircle className="check-icon" size={80} color="#7B1D2E" />
      <h1 className="gold-text">¡Pedido Confirmado!</h1>
      <p className="serif">Gracias por confiar en Garum.</p>
      
      <div className="details">
        <p>Tu comanda para la <strong>Mesa {mesa}</strong> ya está en cocina.</p>
        <p>En breve te lo serviremos.</p>
      </div>

      <Link href={`/${mesa}`} className="gold-button back-btn">
        <ArrowLeft size={18} /> VOLVER A LA CARTA
      </Link>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <main className="success-container">
      <Suspense fallback={<div>Cargando...</div>}>
        <SuccessContent />
      </Suspense>

      <style jsx>{`
        .success-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: var(--background);
        }

        .success-card {
          max-width: 500px;
          text-align: center;
          padding: 3rem;
          border-radius: 30px;
          border: 1px solid var(--border);
        }

        .check-icon {
          margin-bottom: 1.5rem;
          animation: scaleIn 0.5s ease-out;
        }

        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        h1 {
          font-size: 2.2rem;
          margin-bottom: 0.5rem;
        }

        .details {
          margin: 2rem 0;
          color: var(--text-muted);
          line-height: 1.6;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 1rem;
          width: 100%;
        }
      `}</style>
    </main>
  );
}
