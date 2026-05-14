import type { SupabaseClient } from '@supabase/supabase-js';
import { startOfTodayMadridIso } from '@garum/shared/format';
import type { Order } from '../shared/types';

/**
 * Lista pedidos anteriores al día actual (Europe/Madrid), incluye paid y cancelled.
 * Pagina por offset/limit. Devuelve array vacío si supabase no está conectado o hay error.
 */
const MAX_LIMIT = 200;

export async function listHistory(
  supabase: SupabaseClient | null,
  limit: number,
  offset: number,
): Promise<Order[]> {
  if (!supabase) return [];
  // Clamp para evitar que un renderer pida 100k filas y bloquee la app.
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1), MAX_LIMIT);
  const safeOffset = Math.max(Number.isFinite(offset) ? Math.floor(offset) : 0, 0);
  const startToday = startOfTodayMadridIso();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('payment_status', ['paid', 'cancelled'])
    .lt('created_at', startToday)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (error) {
    console.error('[History] Error listando historial:', error.message);
    return [];
  }
  return (data ?? []) as Order[];
}
