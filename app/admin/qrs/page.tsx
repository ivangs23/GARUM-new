"use client";

import { QRCodeSVG } from 'qrcode.react';
import { Wine } from 'lucide-react';
import React, { useState } from 'react';

export default function QrGeneratorPage() {
  const [baseUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );

  const totalMesas = 30;
  const mesas = Array.from({ length: totalMesas }, (_, i) => i + 1);

  return (
    <main className="qr-admin-container">
      <header className="no-print admin-header">
        <h1 className="gold-text">Generador de Códigos QR</h1>
        <p>Prepara las 30 mesas de Garum. Usa <code>Cmd + P</code> para imprimir.</p>
        <button onClick={() => window.print()} className="gold-button">IMPRIMIR TODAS</button>
      </header>

      <div className="qr-grid">
        {mesas.map(mesa => (
          <div key={mesa} className="qr-card">
            <div className="brand">
              <Wine size={20} color="#d4af37" />
              <span>GARUM</span>
            </div>
            
            <div className="qr-wrapper">
              {baseUrl && (
                <QRCodeSVG 
                  value={`${baseUrl}/${mesa}`} 
                  size={150}
                  level="H" // Alta corrección de errores por si el papel se mancha
                  includeMargin={true}
                />
              )}
            </div>

            <div className="table-info">
              <span className="serif">Vinoteca & Cafetería</span>
              <h3>MESA {mesa}</h3>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .qr-admin-container {
          padding: 2rem;
          background: #fdfdfd;
          min-height: 100vh;
          color: #1a1a1a;
        }

        .admin-header {
          text-align: center;
          margin-bottom: 3rem;
          padding: 2rem;
          background: #1a1a1a;
          color: white;
          border-radius: 15px;
        }

        .qr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 2rem;
        }

        .qr-card {
          border: 1px solid #eee;
          padding: 2.5rem 1.5rem;
          text-align: center;
          border-radius: 12px;
          background: white;
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
          page-break-inside: avoid;
        }

        .brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
          margin-bottom: 1.5rem;
          color: #1a1a1a;
        }

        .qr-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .table-info h3 {
          font-size: 1.5rem;
          margin: 0;
          color: #d4af37;
        }

        .serif {
          font-family: var(--font-playfair);
          font-style: italic;
          font-size: 0.8rem;
          color: #666;
        }

        @media print {
          .no-print { display: none; }
          .qr-admin-container { padding: 0; background: white; }
          .qr-grid { grid-template-columns: repeat(3, 1fr); gap: 1cm; }
          .qr-card { border: 1px solid #ccc; box-shadow: none; }
        }
      `}</style>
    </main>
  );
}
