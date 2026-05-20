"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import AdminNav from './AdminNav';
import '../admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-layout">
      {/* Top bar — solo visible en móvil */}
      <div className="admin-topbar">
        <button className="admin-hamburger" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu size={22} />
        </button>
        <Image
          src="/Logo%20garum.png"
          alt="Garum Vinoteca"
          className="admin-topbar-logo"
          width={786}
          height={472}
          style={{ height: '60px', width: 'auto', display: 'block' }}
          priority
        />
        <div style={{ width: 40 }} />
      </div>

      {/* Overlay */}
      {open && <div className="admin-overlay" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <AdminNav open={open} onClose={() => setOpen(false)} />

      <main className="admin-main">{children}</main>
    </div>
  );
}
