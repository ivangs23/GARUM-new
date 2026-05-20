export default function ProductsLoading() {
  return (
    <div className="products-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando productos…</span>

      <div className="admin-page-header">
        <div className="sk sk-title" />
        <div className="sk sk-action" />
      </div>

      <div className="sk-list">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sk-row">
            <div className="sk sk-thumb" />
            <div className="sk-row-text">
              <div className="sk sk-line sk-line-60" />
              <div className="sk sk-line sk-line-40" />
            </div>
            <div className="sk sk-price" />
            <div className="sk sk-toggle" />
          </div>
        ))}
      </div>

      <style>{`
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
        }
        .sk {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 0%,
            rgba(255,255,255,0.1) 50%,
            rgba(255,255,255,0.04) 100%
          );
          background-size: 200% 100%;
          border-radius: 6px;
          animation: sk-shimmer 1.4s ease-in-out infinite;
        }
        @keyframes sk-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sk { animation: none; }
        }
        .sk-title { width: 180px; height: 32px; }
        .sk-action { width: 140px; height: 40px; border-radius: 8px; }
        .sk-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .sk-row {
          display: grid;
          grid-template-columns: 60px 1fr 80px 60px;
          gap: 1rem;
          align-items: center;
          background: #111;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 1rem;
        }
        .sk-thumb { width: 60px; height: 60px; border-radius: 8px; }
        .sk-row-text { display: flex; flex-direction: column; gap: 0.5rem; }
        .sk-line { height: 12px; border-radius: 4px; }
        .sk-line-40 { width: 40%; }
        .sk-line-60 { width: 60%; }
        .sk-price { width: 60px; height: 18px; }
        .sk-toggle { width: 50px; height: 28px; border-radius: 14px; }
      `}</style>
    </div>
  );
}
