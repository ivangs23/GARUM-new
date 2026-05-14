import { createSupabaseServerClient } from "@/lib/supabase-server";
import NewCategoryModal from "./NewCategoryModal";
import CategoriesList, { type CategoryRow } from "./CategoriesList";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order");

  if (error) {
    console.error("[admin/categories] query failed:", error);
    return (
      <div className="products-page">
        <h1 className="admin-page-title">Categorías</h1>
        <p className="error-msg">
          No se pudieron cargar las categorías. Revisa la conexión y recarga la página.
        </p>
      </div>
    );
  }

  const rows = (categories ?? []) as unknown as CategoryRow[];

  return (
    <div className="products-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Categorías</h1>
        <NewCategoryModal allCategories={categories ?? []} />
      </div>

      <CategoriesList categories={rows} />
    </div>
  );
}
