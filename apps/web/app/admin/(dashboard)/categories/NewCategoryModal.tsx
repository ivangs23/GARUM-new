"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import AdminModal from '@/app/admin/AdminModal';
import CategoryForm from './CategoryForm';

type CategoryFlat = { id: string; name: string; parent_id: string | null };

export default function NewCategoryModal({ allCategories }: { allCategories: CategoryFlat[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button className="admin-btn-sm" onClick={() => setOpen(true)}>
        <Plus size={16} /> Nueva categoría
      </button>

      {open && (
        <AdminModal title="Nueva categoría" onClose={() => setOpen(false)}>
          <CategoryForm
            allCategories={allCategories}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        </AdminModal>
      )}
    </>
  );
}
