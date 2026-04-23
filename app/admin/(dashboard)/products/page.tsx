import { createSupabaseServerClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
import NewProductModal from "./NewProductModal";
import ProductsList, { type Product } from "./ProductsList";

export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from("products").select("*, categories(name)").order("sort_order"),
    supabase.from("categories").select("id, name, parent_id").order("sort_order"),
  ]);

  return (
    <div className="products-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Productos</h1>
        <NewProductModal categories={categories ?? []} />
      </div>

      <ProductsList
        products={(products ?? []) as unknown as Product[]}
        categories={categories ?? []}
      />
    </div>
  );
}
