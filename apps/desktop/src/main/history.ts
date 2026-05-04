import type { SupabaseClient } from '@supabase/supabase-js';
import { startOfTodayMadridIso } from '@garum/shared/format';
import type { Order } from '../shared/types';

/**
 * Lista pedidos anteriores al día actual (Europe/Madrid), incluye paid y cancelled.
 * Pagina por offset/limit. Devuelve array vacío si supabase no está conectado o hay error.
 */
export async function listHistory(
  supabase: SupabaseClient | null,
  limit: number,
  offset: number,
): Promise<Order[]> {
  if (!supabase) return [];
  const startToday = startOfTodayMadridIso();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('payment_status', ['paid', 'cancelled'])
    .lt('created_at', startToday)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[History] Error listando historial:', error.message);
    return [];
  }
  return (data ?? []) as Order[];
}
