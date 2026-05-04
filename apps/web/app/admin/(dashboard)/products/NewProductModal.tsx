"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import AdminModal from '@/app/admin/AdminModal';
import ProductForm from './ProductForm';

export default function NewProductModal({
  categories,
}: {
  categories: { id: string; name: string; parent_id: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button className="admin-btn-sm" onClick={() => setOpen(true)}>
        <Plus size={16} /> Nuevo producto
      </button>

      {open && (
        <AdminModal title="Nuevo producto" onClose={() => setOpen(false)}>
          <ProductForm
            categories={categories}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        </AdminModal>
      )}
    </>
  );
}
