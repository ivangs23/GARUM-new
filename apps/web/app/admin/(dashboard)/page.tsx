import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { Tag, UtensilsCrossed, ShoppingBag, QrCode, TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient();

  // Inicio del día actual en UTC — evita problemas si servidor y cliente tienen timezones distintos
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    { count: catCount },
    { count: prodCount },
    { count: qrCount },
    { count: todayOrderCount },
    { data: revenueData },
    { count: pendingData },
  ] = await Promise.all([
    supabase.from('categories').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_available', true),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
    supabase.from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'paid')
      .gte('created_at', todayStart.toISOString()),
    supabase.from('orders')
      .select('total_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', todayStart.toISOString()),
    supabase.from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'paid')
      .eq('staff_status', 'pending'),
  ]);

  const todayRevenue = (revenueData ?? []).reduce((sum, o) => sum + (o.total_amount ?? 0), 0);

  const stats = [
    { label: 'Pedidos hoy',      value: todayOrderCount ?? 0,        icon: ShoppingBag,    href: '/staff',            sub: `${todayRevenue.toFixed(2)}€ recaudados` },
    { label: 'Pendientes staff', value: pendingData ?? 0,            icon: TrendingUp,     href: '/staff',            sub: 'en cocina o barra' },
    { label: 'Productos activos',value: prodCount ?? 0,              icon: UtensilsCrossed, href: '/admin/products',  sub: null },
    { label: 'Categorías',       value: catCount ?? 0,               icon: Tag,            href: '/admin/categories', sub: null },
    { label: 'Mesas con QR',     value: qrCount ?? 0,                icon: QrCode,         href: '/admin/qrs',        sub: 'una por categoría' },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Dashboard</h1>
      <div className="admin-stats-grid">
        {stats.map(({ label, value, icon: Icon, href, sub }) => (
          <Link key={label} href={href} className="admin-stat-card">
            <Icon size={28} color="var(--primary)" />
            <div>
              <p className="admin-stat-value">{value}</p>
              <p className="admin-stat-label">{label}</p>
              {sub && <p className="admin-stat-sub">{sub}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
