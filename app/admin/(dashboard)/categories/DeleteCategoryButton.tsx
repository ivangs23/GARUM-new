"use client";

import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function DeleteCategoryButton({ id }: { id: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('¿Eliminar esta categoría? Se eliminarán también sus productos.')) return;
    await supabase.from('categories').delete().eq('id', id);
    router.refresh();
  };

  return (
    <button onClick={handleDelete} className="action-btn delete-btn">
      <Trash2 size={15} />
      <style jsx>{`
        .delete-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
        }
        .delete-btn:hover { border-color: #f87171; color: #f87171; }
      `}</style>
    </button>
  );
}
