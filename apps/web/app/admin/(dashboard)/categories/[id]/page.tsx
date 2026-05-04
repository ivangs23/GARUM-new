import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import CategoryForm from '../CategoryForm';

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: category }, { data: allCategories }] = await Promise.all([
    supabase.from('categories').select('*').eq('id', id).single(),
    supabase.from('categories').select('id, name, parent_id').order('sort_order'),
  ]);

  if (!category) notFound();

  return (
    <div>
      <h1 className="admin-page-title">Editar Categoría</h1>
      <CategoryForm initial={category} allCategories={allCategories ?? []} />
    </div>
  );
}
