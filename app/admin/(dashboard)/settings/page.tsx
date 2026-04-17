import { createSupabaseServerClient } from '@/lib/supabase-server';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('settings').select('key, value');

  const rows: Record<string, string> = Object.fromEntries(
    (data ?? []).map(r => [r.key, r.value])
  );

  return (
    <div>
      <h1 className="admin-page-title">Configuración</h1>
      <SettingsClient
        initialEnabled={rows['maintenance_enabled'] === 'true'}
        initialMessage={rows['maintenance_message'] ?? 'Estamos cerrados temporalmente. ¡Volvemos muy pronto!'}
      />
    </div>
  );
}
