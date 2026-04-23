"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, ChefHat, Wine, Search, X } from "lucide-react";
import DeleteCategoryButton from "./DeleteCategoryButton";
import { buildCategoryTree, flattenTree, type FlatNode } from "@/lib/category-tree";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  destination: "cocina" | "barra";
  sort_order: number | null;
};

type Destination = "all" | "cocina" | "barra";
type Level = "all" | "root" | "sub";

export default function CategoriesList({ categories }: { categories: CategoryRow[] }) {
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState<Destination>("all");
  const [level, setLevel] = useState<Level>("all");

  const treeNodes = useMemo<FlatNode<CategoryRow>[]>(
    () => flattenTree(buildCategoryTree(categories)),
    [categories]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const hasSearch = term !== "";

    return treeNodes.filter((n) => {
      if (destination !== "all" && n.destination !== destination) return false;
      if (level === "root" && n.depth !== 0) return false;
      if (level === "sub" && n.depth === 0) return false;
      if (!hasSearch) return true;
      const hay = `${n.name ?? ""} ${n.slug ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [treeNodes, search, destination, level]);

  const hasActiveFilters = search.trim() !== "" || destination !== "all" || level !== "all";

  const resetFilters = () => {
    setSearch("");
    setDestination("all");
    setLevel("all");
  };

  return (
    <div className="products-list">
      <div className="products-filters">
        <div className="products-search">
          <Search size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o slug…"
          />
          {search && (
            <button
              type="button"
              className="products-search-clear"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          className="products-select"
          value={destination}
          onChange={(e) => setDestination(e.target.value as Destination)}
        >
          <option value="all">Todos los destinos</option>
          <option value="cocina">Cocina</option>
          <option value="barra">Barra</option>
        </select>

        <select
          className="products-select"
          value={level}
          onChange={(e) => setLevel(e.target.value as Level)}
        >
          <option value="all">Todos los niveles</option>
          <option value="root">Solo principales</option>
          <option value="sub">Solo subcategorías</option>
        </select>

        <div className="products-count">
          {filtered.length} / {treeNodes.length}
          {hasActiveFilters && (
            <button type="button" className="products-reset" onClick={resetFilters}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="admin-table-wrap products-table-wrap">
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
            {filtered.map((cat) => (
              <tr key={cat.id}>
                <td>
                  <span
                    style={{
                      paddingLeft: `${cat.depth * 1.5}rem`,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    {cat.depth > 0 && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>└</span>
                    )}
                    <strong>{cat.name}</strong>
                  </span>
                </td>
                <td className="muted">{cat.slug}</td>
                <td>
                  <span className={`admin-badge ${cat.destination}`}>
                    {cat.destination === "cocina" ? <ChefHat size={13} /> : <Wine size={13} />}
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
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="empty">
                  {categories.length === 0
                    ? "Sin categorías aún"
                    : "Ninguna categoría coincide con los filtros"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
