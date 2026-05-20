export default function CategoriesLoading() {
  return (
    <div className="categories-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando categorías…</span>

      <div className="admin-page-header">
        <div className="sk sk-title" />
        <div className="sk sk-action" />
      </div>

      <div className="sk-list">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="sk-row">
            <div className="sk sk-icon-circle" />
            <div className="sk-row-text">
              <div className="sk sk-line sk-line-50" />
              <div className="sk sk-line sk-line-30" />
            </div>
            <div className="sk sk-badge" />
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
          grid-template-columns: 44px 1fr 70px;
          gap: 1rem;
          align-items: center;
          background: #111;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 1rem;
        }
        .sk-icon-circle { width: 44px; height: 44px; border-radius: 50%; }
        .sk-row-text { display: flex; flex-direction: column; gap: 0.5rem; }
        .sk-line { height: 12px; border-radius: 4px; }
        .sk-line-30 { width: 30%; }
        .sk-line-50 { width: 50%; }
        .sk-badge { width: 60px; height: 22px; border-radius: 999px; }
      `}</style>
    </div>
  );
}
