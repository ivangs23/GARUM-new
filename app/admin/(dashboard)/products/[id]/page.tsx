import { createSupabaseServerClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import ProductForm from '../ProductForm';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*, product_extras(*)').eq('id', id).single(),
    supabase.from('categories').select('id, name, parent_id').order('sort_order'),
  ]);

  if (!product) notFound();

  return (
    <div>
      <h1 className="admin-page-title">Editar Producto</h1>
      <ProductForm initial={product} categories={categories ?? []} />
    </div>
  );
}
