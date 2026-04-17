import { createSupabaseServerClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil } from 'lucide-react';
import DeleteProductButton from './DeleteProductButton';
import ToggleAvailableButton from './ToggleAvailableButton';
import NewProductModal from './NewProductModal';

export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*, categories(name)').order('sort_order'),
    supabase.from('categories').select('id, name, parent_id').order('sort_order'),
  ]);

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Productos</h1>
        <NewProductModal categories={categories ?? []} />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Disponible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products?.map(p => (
              <tr key={p.id}>
                <td>
                  <div className="admin-product-cell">
                    {p.image_url
                      ? <Image src={p.image_url} alt={p.name} width={40} height={40} className="admin-thumb" />
                      : <div className="admin-thumb-placeholder" />
                    }
                    <div>
                      <strong>{p.name}</strong>
                      <p className="admin-product-desc">{p.description}</p>
                    </div>
                  </div>
                </td>
                <td className="muted">{(p.categories as any)?.name}</td>
                <td><strong className="admin-price">{Number(p.price).toFixed(2)}€</strong></td>
                <td>
                  <ToggleAvailableButton id={p.id} available={p.is_available ?? true} />
                </td>
                <td>
                  <div className="admin-actions">
                    <Link href={`/admin/products/${p.id}`} className="admin-action-btn">
                      <Pencil size={15} />
                    </Link>
                    <DeleteProductButton id={p.id} />
                  </div>
                </td>
              </tr>
            ))}
            {!products?.length && (
              <tr><td colSpan={5} className="empty">Sin productos aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
