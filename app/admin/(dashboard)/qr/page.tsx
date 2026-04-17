"use client";

import { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Plus, Minus, Info } from 'lucide-react';

export default function QRGeneratorPage() {
  const [numTables, setNumTables] = useState(30);
  const [baseUrl, setBaseUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const tables = Array.from({ length: numTables }, (_, i) => i + 1);

  return (
    <div className="qr-container">
      <div className="no-print">
        <h1 className="admin-page-title">Generador de códigos QR</h1>
        
        <div className="controls-card glass">
          <div className="control-group">
            <label>Número de mesas</label>
            <div className="num-selector">
              <button 
                onClick={() => setNumTables(Math.max(1, numTables - 1))}
                className="control-btn"
              >
                <Minus size={16} />
              </button>
              <input 
                type="number" 
                value={numTables} 
                onChange={(e) => setNumTables(parseInt(e.target.value) || 1)}
              />
              <button 
                onClick={() => setNumTables(numTables + 1)}
                className="control-btn"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>URL Base del Menú</label>
            <input 
              type="text" 
              placeholder="https://garum.es" 
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="url-input"
            />
            <small className="help-text">
              <Info size={12} /> Se añadirá el número de mesa al final: {baseUrl}/1
            </small>
          </div>

          <button className="gold-button print-action-btn" onClick={handlePrint}>
            <Printer size={18} /> IMPRIMIR TODAS
          </button>
        </div>
      </div>

      <div className="qr-grid" ref={printRef}>
        {tables.map((table) => (
          <div key={table} className="qr-item">
            <div className="qr-card">
              <div className="qr-header">
                <span className="qr-brand gold-text">GARUM</span>
                <span className="qr-sub">Vinoteca & Cocina</span>
              </div>
              
              <div className="qr-code-wrapper">
                <QRCodeSVG 
                  value={`${baseUrl}/${table}`} 
                  size={180}
                  level="H"
                  includeMargin={false}
                  imageSettings={{
                    src: "/favicon.ico",
                    x: undefined,
                    y: undefined,
                    height: 24,
                    width: 24,
                    excavate: true,
                  }}
                />
              </div>

              <div className="qr-footer">
                <div className="mesa-number">MESA {table}</div>
                <p className="qr-instruction">Escanea para pedir</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .qr-container {
          padding: 1rem 0;
        }
        
        .controls-card {
          padding: 2rem;
          margin-bottom: 2rem;
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          align-items: flex-end;
          border: 1px solid var(--border);
          border-radius: 16px;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .control-group label {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .num-selector {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #1a1a1a;
          padding: 0.4rem;
          border-radius: 10px;
          border: 1px solid #333;
        }

        .num-selector input {
          width: 50px;
          text-align: center;
          background: none;
          border: none;
          color: white;
          font-weight: 700;
          outline: none;
        }

        .control-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: #333;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }

        .control-btn:hover {
          background: var(--primary);
        }

        .url-input {
          padding: 0.75rem 1rem;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 10px;
          color: white;
          min-width: 300px;
          outline: none;
        }

        .url-input:focus {
          border-color: var(--primary);
        }

        .help-text {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .print-action-btn {
          height: 48px;
          padding: 0 2rem;
        }

        .qr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 2rem;
        }

        .qr-item {
          display: flex;
          justify-content: center;
        }

        .qr-card {
          background: white;
          color: black;
          width: 240px;
          padding: 1.5rem;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1px solid #eee;
          text-align: center;
        }

        .qr-header {
          display: flex;
          flex-direction: column;
        }

        .qr-brand {
          font-size: 1.8rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          margin: 0;
          color: #7B4F96 !important;
        }

        .qr-sub {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #888;
        }

        .qr-code-wrapper {
          padding: 1rem;
          background: #fdfdfd;
          border: 1px solid #f0f0f0;
          border-radius: 12px;
        }

        .qr-footer {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .mesa-number {
          font-size: 1.4rem;
          font-weight: 900;
          color: white;
          background: #7B4F96;
          padding: 0.2rem 1rem;
          border-radius: 8px;
        }

        .qr-instruction {
          font-size: 0.8rem;
          color: #555;
          margin: 0.5rem 0 0;
          font-weight: 500;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          
          body {
            background: white !important;
            padding: 0 !important;
          }

          .qr-grid {
            display: block !important;
            padding: 0 !important;
          }

          .qr-item {
            page-break-inside: avoid;
            margin-bottom: 2cm;
            display: inline-block;
            width: 50%;
            padding: 1cm;
            box-sizing: border-box;
          }

          .qr-card {
            box-shadow: none;
            border: 2px solid #000;
          }
        }
      `}</style>
    </div>
  );
}
