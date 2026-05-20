export default function SettingsLoading() {
  return (
    <div className="settings-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando ajustes…</span>

      <div className="sk sk-title" />

      <div className="sk-card">
        <div className="sk sk-section-title" />
        <div className="sk sk-line sk-line-80" />
        <div className="sk sk-line sk-line-60" />
        <div className="sk sk-btn" />
      </div>

      <div className="sk-card">
        <div className="sk sk-section-title" />
        <div className="sk sk-line sk-line-70" />
        <div className="sk sk-input" />
        <div className="sk sk-btn" />
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
        .sk-title { width: 200px; height: 32px; margin-bottom: 1.5rem; }
        .sk-card {
          background: #111;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .sk-section-title { width: 40%; height: 20px; }
        .sk-line { height: 12px; border-radius: 4px; }
        .sk-line-60 { width: 60%; }
        .sk-line-70 { width: 70%; }
        .sk-line-80 { width: 80%; }
        .sk-input { width: 100%; height: 40px; border-radius: 8px; }
        .sk-btn { width: 160px; height: 40px; border-radius: 8px; margin-top: 0.5rem; }
      `}</style>
    </div>
  );
}
