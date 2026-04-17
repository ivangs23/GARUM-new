"use client";

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function AdminModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="admin-modal" ref={panelRef}>
        {/* Cabecera */}
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">{title}</h2>
          <button className="admin-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="admin-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
