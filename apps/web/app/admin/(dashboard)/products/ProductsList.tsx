"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Pencil, Search, X } from "lucide-react";
import DeleteProductButton from "./DeleteProductButton";
import ToggleAvailableButton from "./ToggleAvailableButton";
import { buildCategoryTree, flattenTree, collectDescendantIds } from "@/lib/category-tree";

export type Category = { id: string; name: string; parent_id: string | null };

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  is_available: boolean | null;
  category_id: string | null;
  categories?: { name: string } | { name: string }[] | null;
};

type Availability = "all" | "available" | "unavailable";

export default function ProductsList({
  products,
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [availability, setAvailability] = useState<Availability>("all");

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const flatTree = useMemo(() => flattenTree(categoryTree), [categoryTree]);

  // Selecting a parent matches the whole subtree.
  const subtreeIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const walk = (nodes: typeof categoryTree) => {
      for (const node of nodes) {
        map.set(node.id, new Set(collectDescendantIds(node)));
        walk(node.children);
      }
    };
    walk(categoryTree);
    return map;
  }, [categoryTree]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const allowed = categoryId === "all" ? null : subtreeIds.get(categoryId);
    return products.filter((p) => {
      if (allowed && (p.category_id == null || !allowed.has(p.category_id))) return false;
      if (availability === "available" && p.is_available === false) return false;
      if (availability === "unavailable" && p.is_available !== false) return false;
      if (!term) return true;
      const hay = `${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [products, search, categoryId, availability, subtreeIds]);

  const hasActiveFilters = search.trim() !== "" || categoryId !== "all" || availability !== "all";

  const resetFilters = () => {
    setSearch("");
    setCategoryId("all");
    setAvailability("all");
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
            placeholder="Buscar por nombre o descripción…"
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
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Filtrar por categoría"
        >
          <option value="all">Todas las categorías</option>
          {flatTree.map((c) => {
            const prefix = c.depth === 0 ? "" : `${"  ".repeat(c.depth)}↳ `;
            return (
              <option key={c.id} value={c.id}>
                {prefix}
                {c.name}
              </option>
            );
          })}
        </select>

        <select
          className="products-select"
          value={availability}
          onChange={(e) => setAvailability(e.target.value as Availability)}
        >
          <option value="all">Todos</option>
          <option value="available">Disponibles</option>
          <option value="unavailable">No disponibles</option>
        </select>

        <div className="products-count">
          {filtered.length} / {products.length}
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
              <th>Producto</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Disponible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="admin-product-cell">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        width={40}
                        height={40}
                        className="admin-thumb"
                      />
                    ) : (
                      <div className="admin-thumb-placeholder" />
                    )}
                    <div className="admin-product-info">
                      <strong>{p.name}</strong>
                      <p className="admin-product-desc">{p.description}</p>
                    </div>
                  </div>
                </td>
                <td className="muted">
                  {(Array.isArray(p.categories) ? p.categories[0]?.name : p.categories?.name) ??
                    "—"}
                </td>
                <td>
                  <strong className="admin-price">{Number(p.price).toFixed(2)}€</strong>
                </td>
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
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="empty">
                  {products.length === 0
                    ? "Sin productos aún"
                    : "Ningún producto coincide con los filtros"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
