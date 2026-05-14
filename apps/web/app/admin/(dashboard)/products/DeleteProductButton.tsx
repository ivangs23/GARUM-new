"use client";

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { deleteProduct } from './actions';

export default function DeleteProductButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm('¿Eliminar este producto?')) return;
    startTransition(async () => {
      const res = await deleteProduct(id);
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
