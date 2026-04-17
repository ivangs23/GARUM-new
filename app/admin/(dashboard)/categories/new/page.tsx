import { createSupabaseServerClient } from '@/lib/supabase-server';
import CategoryForm from '../CategoryForm';

export default async function NewCategoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: allCategories } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .order('sort_order');

  return (
    <div>
      <h1 className="admin-page-title">Nueva Categoría</h1>
      <CategoryForm allCategories={allCategories ?? []} />
    </div>
  );
}
