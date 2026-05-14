'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function deleteProduct(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: 'No autorizado' };
  }

  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'ID inválido' };
  }

  const { error } = await supabaseAdmin.from('products').delete().eq('id', id);
  if (error) {
    console.error('deleteProduct failed:', error);
    return { ok: false, error: 'No se pudo eliminar' };
  }
  revalidatePath('/admin/products');
  return { ok: true };
}
