export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando dashboard…</span>

      <div className="sk-page-title sk" />

      <div className="admin-stats-grid">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="admin-stat-card sk-stat-card">
            <div className="sk sk-icon" />
            <div className="sk-stat-text">
              <div className="sk sk-value" />
              <div className="sk sk-label" />
              <div className="sk sk-sub" />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .sk {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.04) 0%,
            rgba(255, 255, 255, 0.1) 50%,
            rgba(255, 255, 255, 0.04) 100%
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
        .sk-page-title {
          width: 200px;
          height: 32px;
          margin-bottom: 1.5rem;
          border-radius: 8px;
        }
        .sk-stat-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          pointer-events: none;
        }
        .sk-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .sk-stat-text {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1;
        }
        .sk-value { width: 60%; height: 24px; }
        .sk-label { width: 80%; height: 14px; }
        .sk-sub   { width: 50%; height: 12px; }
      `}</style>
    </div>
  );
}
