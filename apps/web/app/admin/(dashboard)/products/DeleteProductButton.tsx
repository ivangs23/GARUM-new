"use client";

import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function DeleteProductButton({ id }: { id: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este producto?')) return;
    await supabase.from('products').delete().eq('id', id);
    router.refresh();
  };

  return (
    <button onClick={handleDelete} className="admin-action-btn delete">
      <Trash2 size={15} />
    </button>
  );
}
