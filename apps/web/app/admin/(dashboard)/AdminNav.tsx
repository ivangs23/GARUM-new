"use client";

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Tag, UtensilsCrossed, QrCode, LogOut, ArrowLeft, X, Settings } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const links = [
  { href: '/admin',            label: 'Dashboard',     icon: LayoutDashboard, exact: true },
  { href: '/admin/categories', label: 'Categorías',    icon: Tag,             exact: false },
  { href: '/admin/products',   label: 'Productos',     icon: UtensilsCrossed, exact: false },
  { href: '/admin/qr',         label: 'QR Mesas',      icon: QrCode,          exact: false },
  { href: '/admin/settings',   label: 'Configuración', icon: Settings,        exact: false },
];

interface AdminNavProps {
  open: boolean;
  onClose: () => void;
}

export default function AdminNav({ open, onClose }: AdminNavProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = '/admin/login';
  };

  return (
    <nav className={`admin-nav glass${open ? ' drawer-open' : ''}`}>
      <button className="drawer-close" onClick={onClose} aria-label="Cerrar">
        <X size={20} />
      </button>

      <div className="nav-logo">
        <Image
          src="/Logo%20garum.png"
          alt="Garum Vinoteca"
          className="nav-logo-img"
          width={48}
          height={48}
          priority
        />
        <small>Admin</small>
      </div>

      <ul className="nav-links">
        <li>
          <Link href="/" className="nav-link" onClick={onClose}>
            <ArrowLeft size={18} /><span>Ver Web</span>
          </Link>
        </li>
        <li style={{ height: '1px', background: 'var(--border)', margin: '0.4rem 1rem' }} />
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={`nav-link${active ? ' active' : ''}`} onClick={onClose}>
                <Icon size={18} /><span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <button onClick={handleLogout} className="logout-btn">
        <LogOut size={18} /><span>Salir</span>
      </button>

      <style jsx>{`
        .admin-nav {
          width: 240px;
          min-height: 100vh;
          height: 100vh;
          display: flex;
          flex-direction: column;
          padding: 2.5rem 1rem;
          gap: 2.5rem;
          background: #fff;
          border-right: 1px solid var(--border);
          position: sticky;
          top: 0;
          overflow-y: auto;
          flex-shrink: 0;
          z-index: 200;
        }
        .drawer-close { display: none; }

        @media (max-width: 768px) {
          .admin-nav {
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            width: 260px;
            min-height: unset;
            transform: translateX(-100%);
            transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
            box-shadow: 4px 0 24px rgba(0,0,0,0.14);
            z-index: 201;
          }
          .admin-nav.drawer-open { transform: translateX(0); }
          .drawer-close {
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 1rem; right: 1rem;
            width: 32px; height: 32px;
            background: none;
            border: 1px solid var(--border);
            border-radius: 8px;
            cursor: pointer;
            color: var(--text-muted);
          }
        }

        .nav-logo {
          text-align: center;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .nav-logo-img { width: 130px; height: auto; display: block; margin: 0 auto; }
        .nav-logo small {
          color: var(--text-muted);
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .nav-links {
          list-style: none;
          padding: 0; margin: 0;
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
        :global(.nav-link:hover)  { background: var(--primary-light); color: var(--primary); }
        :global(.nav-link.active) { background: var(--primary); color: #fff; box-shadow: var(--accent-shadow); }

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
        .logout-btn:hover { border-color: #f87171; color: #f87171; background: #fef2f2; }
      `}</style>
    </nav>
  );
}
