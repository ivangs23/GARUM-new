import { createSupabaseServerClient } from '@/lib/supabase-server';
import HealthClient from './HealthClient';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const supabase = await createSupabaseServerClient();

  // Si la migración 016 aún no está aplicada, estas queries devuelven error;
  // el cliente muestra el estado vacío con una pista, sin romper la página.
  const [{ data: heartbeats }, { data: logs }] = await Promise.all([
    supabase
      .from('desktop_heartbeat')
      .select('*')
      .order('updated_at', { ascending: false }),
    supabase
      .from('desktop_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  return (
    <div>
      <h1 className="admin-page-title">Salud del local</h1>
      <HealthClient initialHeartbeats={heartbeats ?? []} initialLogs={logs ?? []} />
    </div>
  );
}
