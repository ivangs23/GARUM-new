"use client";

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { deleteCategory } from './actions';

export default function DeleteCategoryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm('¿Eliminar esta categoría? Se eliminarán también sus productos.')) return;
    startTransition(async () => {
      const res = await deleteCategory(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="admin-action-btn delete"
      aria-busy={pending}
    >
      <Trash2 size={15} />
    </button>
  );
}
