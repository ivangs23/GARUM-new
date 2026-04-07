import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { Plus, Pencil, ChefHat, Wine } from 'lucide-react';
import DeleteCategoryButton from './DeleteCategoryButton';

export default async function CategoriesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Categorías</h1>
        <Link href="/admin/categories/new" className="admin-btn-sm">
          <Plus size={16} /> Nueva categoría
        </Link>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Slug</th>
              <th>Destino</th>
              <th>Orden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories?.map(cat => (
              <tr key={cat.id}>
                <td><strong>{cat.name}</strong></td>
                <td className="muted">{cat.slug}</td>
                <td>
                  <span className={`admin-badge ${cat.destination}`}>
                    {cat.destination === 'cocina' ? <ChefHat size={13} /> : <Wine size={13} />}
                    {cat.destination}
                  </span>
                </td>
                <td className="muted">{cat.sort_order}</td>
                <td className="admin-actions">
                  <Link href={`/admin/categories/${cat.id}`} className="admin-action-btn">
                    <Pencil size={15} />
                  </Link>
                  <DeleteCategoryButton id={cat.id} />
                </td>
              </tr>
            ))}
            {!categories?.length && (
              <tr><td colSpan={5} className="empty">Sin categorías aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
