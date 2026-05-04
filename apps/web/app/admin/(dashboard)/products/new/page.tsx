import { createSupabaseServerClient } from '@/lib/supabase-server';
import ProductForm from '../ProductForm';

export default async function NewProductPage() {
  const supabase = await createSupabaseServerClient();
  const { data: categories } = await supabase.from('categories').select('id, name, parent_id').order('sort_order');

  return (
    <div>
      <h1 className="admin-page-title">Nuevo Producto</h1>
      <ProductForm categories={categories ?? []} />
    </div>
  );
}
