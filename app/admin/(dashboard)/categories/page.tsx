import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { Pencil, ChefHat, Wine } from 'lucide-react';
import DeleteCategoryButton from './DeleteCategoryButton';
import NewCategoryModal from './NewCategoryModal';
import { buildCategoryTree, flattenTree } from '@/lib/category-tree';

export default async function CategoriesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  const flatNodes = flattenTree(buildCategoryTree(categories ?? []));

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Categorías</h1>
        <NewCategoryModal allCategories={categories ?? []} />
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
            {flatNodes.map(cat => (
              <tr key={cat.id}>
                <td>
                  <span style={{ paddingLeft: `${cat.depth * 1.5}rem`, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {cat.depth > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>└</span>}
                    <strong>{cat.name}</strong>
                  </span>
                </td>
                <td className="muted">{cat.slug}</td>
                <td>
                  <span className={`admin-badge ${cat.destination}`}>
                    {cat.destination === 'cocina' ? <ChefHat size={13} /> : <Wine size={13} />}
                    {cat.destination}
                  </span>
                </td>
                <td className="muted">{cat.sort_order}</td>
                <td>
                  <div className="admin-actions">
                    <Link href={`/admin/categories/${cat.id}`} className="admin-action-btn">
                      <Pencil size={15} />
                    </Link>
                    <DeleteCategoryButton id={cat.id} />
                  </div>
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
