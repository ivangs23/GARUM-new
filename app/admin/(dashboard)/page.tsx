import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { Tag, UtensilsCrossed, ShoppingBag, QrCode } from 'lucide-react';

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient();

  const [{ count: catCount }, { count: prodCount }, { count: orderCount }] = await Promise.all([
    supabase.from('categories').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid'),
  ]);

  const stats = [
    { label: 'Categorías',   value: catCount ?? 0,  icon: Tag,            href: '/admin/categories' },
    { label: 'Productos',    value: prodCount ?? 0,  icon: UtensilsCrossed, href: '/admin/products' },
    { label: 'Pedidos hoy',  value: orderCount ?? 0, icon: ShoppingBag,    href: '/staff' },
    { label: 'Mesas con QR', value: 30,              icon: QrCode,         href: '/admin/qr' },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Dashboard</h1>
      <div className="admin-stats-grid">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="admin-stat-card">
            <Icon size={28} color="var(--primary)" />
            <div>
              <p className="admin-stat-value">{value}</p>
              <p className="admin-stat-label">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
