import { createSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Asegura que el caller es un usuario admin autenticado. Cualquier server
 * action que mute datos del menú o de pedidos debe llamar a esta función
 * antes de tocar la DB. Si no hay sesión válida, lanza un Error que el
 * caller convierte en respuesta 401 / redirección.
 *
 * Nota: por ahora cualquier usuario autenticado con sesión via cookies
 * cuenta como admin. Si en el futuro se introducen roles (staff vs admin),
 * añadir la comprobación aquí — todas las rutas admin pasarán por este
 * único punto.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('UNAUTHORIZED');
  }
  return { userId: data.user.id };
}
