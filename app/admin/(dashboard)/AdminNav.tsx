"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Tag, UtensilsCrossed, QrCode, LogOut, ArrowLeft } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const links = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/categories', label: 'Categorías', icon: Tag, exact: false },
  { href: '/admin/products', label: 'Productos', icon: UtensilsCrossed, exact: false },
  { href: '/admin/qr', label: 'QR Mesas', icon: QrCode, exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = '/admin/login';
  };

  return (
    <nav className="admin-nav glass">
      <div className="nav-logo">
        <span className="gold-text">GARUM</span>
        <small>Admin</small>
      </div>

      <ul className="nav-links">
        <li>
          <Link href="/" className="nav-link">
            <ArrowLeft size={18} />
            <span>Ver Web</span>
          </Link>
        </li>
        <li style={{ height: '1px', background: '#222', margin: '0.4rem 1rem' }} />
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={`nav-link ${active ? 'active' : ''}`}>
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <button onClick={handleLogout} className="logout-btn">
        <LogOut size={18} />
        <span>Salir</span>
      </button>

      <style jsx>{`
        .admin-nav {
          width: 240px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          padding: 2.5rem 1rem;
          border-right: 1px solid var(--border);
          gap: 2.5rem;
          background: #fff;
          position: sticky;
          top: 0;
        }
        .nav-logo {
          text-align: center;
          padding: 0 0 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .nav-logo span {
          display: block;
          font-size: 1.8rem;
          font-weight: 900;
          letter-spacing: 0.15em;
          font-family: var(--font-playfair);
          color: var(--primary);
        }
        .nav-logo small {
          color: var(--text-muted);
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .nav-links {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          flex: 1;
        }
        :global(.nav-link) {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.8rem 1.2rem;
          border-radius: 12px;
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        :global(.nav-link:hover) {
          background: var(--primary-light);
          color: var(--primary);
        }
        :global(.nav-link.active) {
          background: var(--primary);
          color: white;
          box-shadow: var(--accent-shadow);
        }
        .logout-btn {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.8rem 1.2rem;
          background: none;
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--text-muted);
          font-size: 0.95rem;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s;
        }
        .logout-btn:hover {
          border-color: #f87171;
          color: #f87171;
          background: #fef2f2;
        }
      `}</style>
    </nav>
  );
}
