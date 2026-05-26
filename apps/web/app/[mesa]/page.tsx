"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Minus, ShoppingBag, ArrowLeft, X } from "lucide-react";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CheckoutDialog from "@/components/CheckoutDialog";
import { supabase } from "@/lib/supabase";
import { buildCategoryTree, countSubtreeProducts, type CategoryNode } from "@/lib/category-tree";
import type { CartItem } from "@/context/CartContext";
import type { Database } from "@garum/shared/database";

type SettingRow = Database["public"]["Tables"]["settings"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductExtraRow = Database["public"]["Tables"]["product_extras"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type RawCategoryWithProducts = CategoryRow & {
  products: (ProductRow & { product_extras: ProductExtraRow[] })[];
};

const ALLERGEN_ICONS: Record<number, string> = {
  1: "🌾",
  2: "🦞",
  3: "🥚",
  4: "🐟",
  5: "🥜",
  6: "🌱",
  7: "🥛",
  8: "🌰",
  9: "🌿",
  10: "🟡",
  11: "🌰",
  12: "💨",
  13: "🌻",
  14: "🐚",
};

type Extra = { id: string; name: string; price: number };
type WineType = "red" | "white" | "rose" | "sparkling" | "fortified" | "dessert";
type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  allergen_ids: number[];
  product_extras: Extra[];
  destination?: "cocina" | "barra";
  // Campos de vino (migración 006)
  wine_type?: WineType | null;
  wine_region?: string | null;
  wine_grapes?: string[] | null;
  wine_vintage?: number | null;
  tasting_notes?: string | null;
  wine_body?: number | null;
  wine_acidity?: number | null;
  wine_sweetness?: number | null;
  is_featured?: boolean;
};
type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  image_url: string | null;
  destination: "cocina" | "barra";
  products: Product[];
  parent_id: string | null;
  children: Category[];
};
type PairingRow = { dish_id: string; wine_id: string; sort_order: number };

// ── CategoryMenuSection ───────────────────────────────────────────────────────
// Componente propio para que styled-jsx aplique scoping correcto en la recursión.
type CatSectionProps = {
  cat: Category;
  depth?: number;
  getQty: (id: string) => number;
  openProduct: (p: Product) => void;
  items: CartItem[];
  removeItem: (id: CartItem["id"]) => void;
  labels: { decrease: string; increase: string };
  renderChildren?: boolean;
};

function CategoryMenuSection({
  cat,
  depth = 0,
  getQty,
  openProduct,
  items,
  removeItem,
  labels,
  renderChildren = true,
}: CatSectionProps) {
  return (
    <section id={cat.slug} className={depth === 0 ? "cat-section" : "cat-subsection"}>
      {depth === 0 ? (
        <h2 className="cat-section-title">{cat.name}</h2>
      ) : (
        <h3 className="cat-subsection-title">
          {cat.image_url ? (
            <img src={cat.image_url} alt="" className="cat-subsection-thumb" loading="lazy" />
          ) : (
            <>{cat.icon} </>
          )}
          {cat.name}
        </h3>
      )}

      {cat.products.length > 0 && (
        <div className="cat-products-list">
          {cat.products.map((p) => {
            const qty = getQty(p.id);
            return (
              <div
                key={p.id}
                className="cat-product-card"
                role="button"
                tabIndex={0}
                aria-label={`${p.name} — ${Number(p.price).toFixed(2)}€`}
                onClick={() => openProduct(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openProduct(p);
                  }
                }}
              >
                <div className={`cat-product-info ${p.image_url ? "has-img" : ""}`}>
                  <h3>{p.name}</h3>
                  <p className="cat-product-desc">{p.description}</p>
                  {p.allergen_ids?.length > 0 && (
                    <div className="cat-allergens" aria-label="Alérgenos">
                      {p.allergen_ids.map((id: number) => (
                        <span key={id} className="cat-allergen-icon" aria-hidden="true">
                          {ALLERGEN_ICONS[id] ?? "⚠️"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="cat-product-action">
                  {p.image_url && (
                    <div className="cat-img-wrap">
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        sizes="90px"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                  )}
                  <span className="cat-price">{Number(p.price).toFixed(2)}€</span>
                  <div
                    className={`cat-qty-controls ${qty === 0 ? "empty" : "filled"}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {qty > 0 && (
                      <>
                        <button
                          type="button"
                          className="cat-qty-btn"
                          aria-label={labels.decrease}
                          onClick={() => {
                            const match = items.find(
                              (i) => i.id === p.id || String(i.id).startsWith(p.id + "_")
                            );
                            if (match) removeItem(match.id);
                          }}
                        >
                          <Minus size={16} aria-hidden="true" />
                        </button>
                        <span className="cat-qty-num" aria-live="polite">
                          {qty}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className="cat-add-btn"
                      aria-label={labels.increase}
                      onClick={() => openProduct(p)}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderChildren &&
        cat.children.map((child) => (
          <CategoryMenuSection
            key={child.id}
            cat={child}
            depth={depth + 1}
            getQty={getQty}
            openProduct={openProduct}
            items={items}
            removeItem={removeItem}
            labels={labels}
          />
        ))}

      <style jsx>{`
        .cat-section {
          margin-bottom: 2.5rem;
        }
        .cat-subsection {
          margin-top: 2rem;
          margin-bottom: 1.5rem;
        }

        .cat-section-title {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          border-left: 3px solid var(--primary);
          padding: 0.4rem 0.8rem;
          font-family: var(--font-playfair);
          background: var(--surface);
          border-radius: 0 10px 10px 0;
          display: inline-block;
        }
        .cat-subsection-title {
          font-size: 1.1rem;
          font-family: var(--font-playfair);
          color: var(--primary);
          border-left: 2px solid var(--primary);
          padding-left: 0.6rem;
          margin-bottom: 0.8rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        .cat-subsection-thumb {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
          display: block;
        }

        .cat-products-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.2rem;
        }
        @media (min-width: 768px) {
          .cat-products-list {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1200px) {
          .cat-products-list {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .cat-product-card {
          background: #fff;
          padding: 1.5rem;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 1.2rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.03);
          position: relative;
        }
        .cat-product-card:active {
          transform: scale(0.98);
        }
        .cat-product-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 40px rgba(123, 29, 46, 0.08);
        }

        .cat-product-info {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .cat-product-info h3 {
          margin: 0;
          font-size: 1.25rem;
          color: #222;
          font-family: var(--font-playfair);
          font-weight: 800;
        }
        .cat-product-desc {
          font-size: 0.85rem;
          color: #777;
          margin: 0;
          line-height: 1.5;
          height: 3em;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .cat-allergens {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-top: 0.2rem;
        }
        .cat-allergen-icon {
          font-size: 0.9rem;
        }

        .cat-product-info.has-img {
          padding-right: 110px;
          min-height: 90px;
        }

        .cat-img-wrap {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          width: 90px;
          height: 90px;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
          background: #fff;
          padding: 4px;
          border: 1px solid rgba(0, 0, 0, 0.03);
        }
        .cat-img-wrap :global(img) {
          border-radius: 14px;
        }

        .cat-product-action {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 0.5rem;
        }
        .cat-price {
          font-weight: 500;
          color: #222;
          font-size: 1.05rem;
        }

        .cat-qty-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 30px;
          transition: all 0.2s;
        }
        .cat-qty-controls.filled {
          background: #fff;
          border: 1px solid rgba(123, 29, 46, 0.2);
          padding: 0.2rem 0.4rem;
          gap: 0.5rem;
          box-shadow: 0 4px 10px rgba(123, 29, 46, 0.05);
        }
        .cat-qty-controls.empty {
          border: none;
          background: transparent;
          padding: 0;
          gap: 0;
        }

        .cat-qty-num {
          font-weight: 800;
          min-width: 18px;
          text-align: center;
          color: #222;
          font-size: 1rem;
        }
        .cat-qty-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: none;
          background: none;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .cat-add-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 1px solid rgba(123, 29, 46, 0.4);
          background: none;
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .cat-qty-controls.filled .cat-add-btn {
          width: 34px;
          height: 34px;
          border: none;
          background: none;
        }
        .cat-qty-controls.empty .cat-add-btn:hover {
          background: rgba(123, 29, 46, 0.05);
          border-color: var(--primary);
        }
      `}</style>
    </section>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function MesaPage({ params }: { params: Promise<{ mesa: string }> }) {
  const { mesa } = use(params);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPath, setCategoryPath] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([]);
  const [productNote, setProductNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(
    null
  );
  const [payError, setPayError] = useState("");
  const [wineFilter, setWineFilter] = useState<WineType | "all">("all");
  const [pairings, setPairings] = useState<PairingRow[]>([]);

  const { addItem, items, totalQuantity, totalAmount, removeItem } = useCart();
  const { t } = useLanguage();

  // Cierra modal con Escape — accesibilidad de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedProduct) setSelectedProduct(null);
      else if (isCartOpen) setIsCartOpen(false);
      else if (showSearch) {
        setShowSearch(false);
        setSearchInput("");
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedProduct, isCartOpen, showSearch]);

  // Bloquea scroll del body cuando hay un modal abierto
  useEffect(() => {
    const locked = Boolean(selectedProduct || isCartOpen);
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedProduct, isCartOpen]);

  // Focus inicial en el modal de producto (para screen readers y teclado)
  const productDialogRef = useRef<HTMLDivElement>(null);
  const cartDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedProduct) productDialogRef.current?.focus();
  }, [selectedProduct]);
  useEffect(() => {
    if (isCartOpen) cartDialogRef.current?.focus();
  }, [isCartOpen]);

  // Suma cantidades de un producto base aunque tenga extras (IDs compuestos: "uuid_extraUuid")
  const getQty = (id: string) =>
    items
      .filter((i) => i.id === id || String(i.id).startsWith(id + "_"))
      .reduce((sum, i) => sum + i.quantity, 0);

  // Debounce: actualiza el filtro 300ms después de que el usuario deje de escribir
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ data: settingsData }, { data, error }, { data: pairingData }] = await Promise.all([
          supabase.from("settings").select("key, value"),
          supabase
            .from("categories")
            .select("*, products(*, product_extras(*))")
            .order("sort_order"),
          supabase
            .from("product_pairings")
            .select("dish_id, wine_id, sort_order")
            .order("sort_order"),
        ]);
        setPairings((pairingData ?? []) as PairingRow[]);

        const settings: Record<string, string> = Object.fromEntries(
          (settingsData ?? []).map((r: SettingRow) => [r.key, r.value])
        );
        setMaintenance({
          enabled: settings["maintenance_enabled"] === "true",
          message:
            settings["maintenance_message"] ??
            "Estamos cerrados temporalmente. ¡Volvemos muy pronto!",
        });

        if (error) throw error;
        if (data?.length) {
          const enriched = (data as unknown as RawCategoryWithProducts[]).map((cat) => ({
            ...cat,
            children: [],
            products: cat.products
              .filter((p) => p.is_available === true)
              .map((p) => ({ ...p, destination: cat.destination })),
          }));
          const roots = buildCategoryTree(enriched as unknown as Category[]).filter(
            (cat) => countSubtreeProducts(cat as unknown as CategoryNode<Category>) > 0
          ) as Category[];
          setCategories(roots);
        }
      } catch (err) {
        console.error("Error cargando la carta:", err);
        setLoadError("No se pudo cargar la carta. Por favor, recarga la página.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCheckout = () => {
    if (!items.length) return;
    setPayError("");
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const openProduct = (p: Product) => {
    setSelectedProduct(p);
    setSelectedExtras([]);
    setProductNote("");
  };

  const confirmAdd = () => {
    if (!selectedProduct) return;
    const extra = selectedExtras.reduce((s, e) => s + e.price, 0);
    const trimmedNote = productNote.trim().slice(0, 200);
    const baseId =
      selectedProduct.id +
      (selectedExtras.length ? "_" + selectedExtras.map((e) => e.id).join("_") : "");
    // Si hay nota, generar id único para que cada nota distinta sea línea propia
    // del carrito en vez de fusionarse con otra entrada del mismo producto.
    const noteSuffix = trimmedNote
      ? "|n" + (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10))
      : "";
    addItem({
      id: baseId + noteSuffix,
      name:
        selectedProduct.name +
        (selectedExtras.length ? ` (${selectedExtras.map((e) => e.name).join(", ")})` : ""),
      price: Number(selectedProduct.price) + extra,
      destination: selectedProduct.destination,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    });
    setSelectedProduct(null);
  };

  const goInto = (slug: string) => setCategoryPath((prev) => [...prev, slug]);
  const goBack = () => setCategoryPath((prev) => prev.slice(0, -1));
  const goHome = () => setCategoryPath([]);
  const goToDepth = (depth: number) => setCategoryPath((prev) => prev.slice(0, depth));

  // Collect all products from the full tree (for search, featured, pairings)
  const collectProducts = (cats: Category[]): Product[] =>
    cats.flatMap((cat) => [...cat.products, ...collectProducts(cat.children)]);

  // Filtra recursivamente un árbol de categorías por tipo de vino
  const filterTreeByWine = (cat: Category, f: WineType | "all"): Category => ({
    ...cat,
    products: f === "all" ? cat.products : cat.products.filter((p) => p.wine_type === f),
    children: cat.children.map((c) => filterTreeByWine(c, f)),
  });

  const categoryHasWines = (cat: Category): boolean =>
    cat.products.some((p) => p.wine_type != null) || cat.children.some(categoryHasWines);

  // Productos destacados — "Recomendados de la casa"
  const featuredProducts: Product[] = collectProducts(categories).filter((p) => p.is_featured);

  // Lookup de producto por ID para resolver maridajes
  const productById = new Map(collectProducts(categories).map((p) => [p.id, p]));

  // Maridajes del producto seleccionado actualmente
  const selectedPairings: Product[] = selectedProduct
    ? pairings
        .filter((pp) => pp.dish_id === selectedProduct.id)
        .map((pp) => productById.get(pp.wine_id))
        .filter((p): p is Product => Boolean(p))
    : [];

  const WINE_TYPES: { key: WineType; labelKey: string }[] = [
    { key: "red", labelKey: "menu.wineTypeRed" },
    { key: "white", labelKey: "menu.wineTypeWhite" },
    { key: "rose", labelKey: "menu.wineTypeRose" },
    { key: "sparkling", labelKey: "menu.wineTypeSparkling" },
    { key: "fortified", labelKey: "menu.wineTypeFortified" },
  ];

  const searchResults: Product[] = search
    ? collectProducts(categories).filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  // Resuelve el nodo actual recorriendo el árbol con los slugs del path
  const resolvePath = (tree: Category[], path: string[]): Category | null => {
    let node: Category | null = null;
    let list: Category[] = tree;
    for (const slug of path) {
      const next = list.find((c) => c.slug === slug);
      if (!next) return null;
      node = next;
      list = next.children;
    }
    return node;
  };

  const atRoot = categoryPath.length === 0;
  const rawCurrentCategory = atRoot ? null : resolvePath(categories, categoryPath);
  const currentChildren: Category[] = atRoot ? categories : (rawCurrentCategory?.children ?? []);
  const showGrid = currentChildren.length > 0;

  // Breadcrumb: nodos a lo largo del path, para mostrar y navegar
  const breadcrumb: Category[] = (() => {
    const out: Category[] = [];
    let list: Category[] = categories;
    for (const slug of categoryPath) {
      const node = list.find((c) => c.slug === slug);
      if (!node) break;
      out.push(node);
      list = node.children;
    }
    return out;
  })();

  // Vinos: el filtro aplica si la categoría actual (o subárbol) tiene vinos
  const currentHasWines = rawCurrentCategory ? categoryHasWines(rawCurrentCategory) : false;

  // Categoría actual con productos filtrados por tipo de vino (si aplica)
  const currentCategory: Category | null = rawCurrentCategory
    ? filterTreeByWine(rawCurrentCategory, currentHasWines ? wineFilter : "all")
    : null;

  // Reset del filtro al cambiar de categoría raíz. Patrón recomendado por
  // React 19: comparar el prop derivado contra el valor anterior dentro del
  // render — setState durante el render fuerza un re-render adicional pero
  // evita el cascading-renders que dispara setState dentro de un useEffect.
  const rootSlug = categoryPath[0] ?? "";
  const [prevRootSlug, setPrevRootSlug] = useState(rootSlug);
  if (prevRootSlug !== rootSlug) {
    setPrevRootSlug(rootSlug);
    setWineFilter("all");
  }

  if (loading)
    return (
      <div className="skeleton-screen" aria-busy="true" aria-live="polite">
        <span className="sr-only">{t("menu.loading") ?? "Cargando carta…"}</span>

        <header className="sk-navbar" aria-hidden="true">
          <div className="sk-navbar-content">
            <div className="sk sk-logo" />
            <div className="sk-navbar-right">
              <div className="sk sk-badge" />
              <div className="sk sk-icon" />
              <div className="sk sk-icon" />
            </div>
          </div>
        </header>

        <main className="sk-main" aria-hidden="true">
          <div className="sk-welcome">
            <div className="sk sk-title" />
            <div className="sk sk-subtitle" />
          </div>

          <div className="sk-featured-title">
            <div className="sk sk-section-title" />
          </div>
          <div className="sk-featured-scroll">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sk-featured-card">
                <div className="sk sk-featured-img" />
                <div className="sk sk-line sk-line-80" />
                <div className="sk sk-line sk-line-50" />
              </div>
            ))}
          </div>

          <div className="sk-cat-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sk-cat-card">
                <div className="sk sk-cat-icon" />
                <div className="sk sk-line sk-line-70" />
                <div className="sk sk-line sk-line-40" />
              </div>
            ))}
          </div>
        </main>

        <style jsx>{`
          .skeleton-screen {
            min-height: 100vh;
            background: var(--background);
          }
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }

          .sk {
            background: linear-gradient(
              90deg,
              rgba(123, 79, 150, 0.06) 0%,
              rgba(123, 79, 150, 0.14) 50%,
              rgba(123, 79, 150, 0.06) 100%
            );
            background-size: 200% 100%;
            border-radius: 8px;
            animation: shimmer 1.4s ease-in-out infinite;
          }
          @keyframes shimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .sk {
              animation: none;
            }
          }

          .sk-navbar {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 1rem;
          }
          .sk-navbar-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .sk-logo {
            width: 100px;
            height: 60px;
            border-radius: 12px;
          }
          .sk-navbar-right {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }
          .sk-badge {
            width: 80px;
            height: 28px;
            border-radius: 999px;
          }
          .sk-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
          }

          .sk-main {
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem 1.2rem;
          }
          .sk-welcome {
            background: var(--surface);
            border-radius: 14px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 2px 16px rgba(0, 0, 0, 0.05);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.75rem;
          }
          .sk-title {
            width: 60%;
            height: 28px;
          }
          .sk-subtitle {
            width: 80%;
            height: 14px;
          }

          .sk-featured-title {
            margin-bottom: 1rem;
          }
          .sk-section-title {
            width: 180px;
            height: 22px;
          }
          .sk-featured-scroll {
            display: flex;
            gap: 1rem;
            overflow: hidden;
            margin-bottom: 2rem;
            padding-bottom: 0.25rem;
          }
          .sk-featured-card {
            flex: 0 0 160px;
            background: var(--surface);
            border-radius: 16px;
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            box-shadow: var(--card-shadow);
          }
          .sk-featured-img {
            width: 100%;
            aspect-ratio: 1 / 1;
            border-radius: 12px;
          }

          .sk-cat-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }
          @media (min-width: 640px) {
            .sk-cat-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          @media (min-width: 1024px) {
            .sk-cat-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }
          .sk-cat-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 1.5rem 1rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.75rem;
            box-shadow: var(--card-shadow);
            min-height: 160px;
          }
          .sk-cat-icon {
            width: 60px;
            height: 60px;
            border-radius: 50%;
          }

          .sk-line {
            height: 12px;
            border-radius: 6px;
          }
          .sk-line-40 {
            width: 40%;
          }
          .sk-line-50 {
            width: 50%;
          }
          .sk-line-70 {
            width: 70%;
          }
          .sk-line-80 {
            width: 80%;
          }
        `}</style>
      </div>
    );

  if (loadError)
    return (
      <div className="error-screen" role="alert">
        <div className="error-card">
          <Image
            src="/Logo%20garum.png"
            alt="Garum Vinoteca"
            className="error-logo"
            width={786}
            height={472}
            style={{ width: '160px', height: 'auto', display: 'block', margin: '0 auto' }}
            priority
          />
          <h2 className="serif">{t("menu.errorTitle")}</h2>
          <p>{loadError}</p>
          <button type="button" className="gold-button" onClick={() => window.location.reload()}>
            {t("menu.retry")}
          </button>
        </div>
        <style jsx>{`
          .error-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
          }
          .error-card {
            max-width: 400px;
            width: 100%;
            background: #fff;
            border-radius: 24px;
            border: 1px solid var(--border);
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
            padding: 2.5rem 2rem;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }
          .error-logo {
            width: 120px;
            height: auto;
          }
          h2 {
            font-size: 1.5rem;
            margin: 0;
            color: var(--text);
          }
          p {
            color: var(--text-muted);
            margin: 0;
            line-height: 1.5;
          }
        `}</style>
      </div>
    );

  if (maintenance?.enabled)
    return (
      <div className="maintenance-screen">
        <div className="maintenance-card">
          <Image
            src="/Logo%20garum.png"
            alt="Garum Vinoteca"
            className="maintenance-logo"
            width={786}
            height={472}
            style={{ width: '160px', height: 'auto', display: 'block', margin: '0 auto' }}
            priority
          />
          <div className="maintenance-icon">🔧</div>
          <h1 className="serif">Fuera de servicio</h1>
          <p className="maintenance-msg">{maintenance.message}</p>
        </div>
        <style jsx>{`
          .maintenance-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
            background: var(--background);
            background-image: url("/pattern.svg");
            background-size: 260px 260px;
          }
          .maintenance-card {
            width: 100%;
            max-width: 400px;
            background: #fff;
            border-radius: 24px;
            border: 1px solid var(--border);
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
            padding: 3rem 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.2rem;
            text-align: center;
          }
          .maintenance-logo {
            width: 140px;
            height: auto;
          }
          .maintenance-icon {
            font-size: 3rem;
            animation: sway 3s ease-in-out infinite;
          }
          @keyframes sway {
            0%,
            100% {
              transform: rotate(-8deg);
            }
            50% {
              transform: rotate(8deg);
            }
          }
          h1 {
            font-size: 1.8rem;
            margin: 0;
            color: var(--text);
          }
          .maintenance-msg {
            color: var(--text-muted);
            font-size: 1rem;
            line-height: 1.6;
            margin: 0;
            white-space: pre-wrap;
          }
        `}</style>
      </div>
    );

  return (
    <div className="menu-container">
      {/* Navbar */}
      <header className="navbar glass" role="banner">
        <div className="navbar-content">
          <Link
            href="/"
            className="brand"
            style={{ textDecoration: "none" }}
            aria-label="Garum Vinoteca — inicio"
          >
            <Image
              src="/Logo%20garum.png"
              alt="Garum Vinoteca"
              className="nav-logo-img"
              width={786}
              height={472}
              style={{ height: '60px', width: 'auto', display: 'block' }}
              priority
            />
          </Link>
          <div className="navbar-right">
            <span className="table-badge" aria-label={`${t("menu.tableLabel")} ${mesa}`}>
              {t("menu.tableLabel")} {mesa}
            </span>
            <LanguageSwitcher />
            <button
              type="button"
              className="icon-btn"
              aria-label={t("menu.searchToggle")}
              aria-expanded={showSearch}
              onClick={() => {
                const next = !showSearch;
                setShowSearch(next);
                if (!next) {
                  setSearchInput("");
                  setSearch("");
                }
              }}
            >
              <Search size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
        {showSearch && (
          <div className="search-bar">
            <Search size={16} color="var(--text-muted)" aria-hidden="true" />
            <label htmlFor="menu-search" className="sr-only">
              {t("menu.searchPlaceholder")}
            </label>
            <input
              id="menu-search"
              type="search"
              autoFocus
              placeholder={t("menu.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={t("menu.searchPlaceholder")}
            />
          </div>
        )}
      </header>

      {/* VISTA RAÍZ: GRID DE CATEGORÍAS PRINCIPALES */}
      {!search && atRoot && (
        <main id="main" className="categories-grid-view">
          <div className="welcome-header">
            <h2 className="serif">{t("menu.welcomeTitle")}</h2>
            <p>{t("menu.welcomeSubtitle")}</p>
          </div>

          {/* Recomendados de la casa — scroll horizontal */}
          {featuredProducts.length > 0 && (
            <section className="featured-section" aria-labelledby="featured-title">
              <h3 id="featured-title" className="featured-title serif">
                {t("menu.featuredSection")}
              </h3>
              <div className="featured-scroll" role="list">
                {featuredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="featured-card"
                    role="listitem"
                    onClick={() => openProduct(p)}
                    aria-label={`${p.name} — ${Number(p.price).toFixed(2)}€`}
                  >
                    {p.image_url ? (
                      <div className="featured-img">
                        <Image
                          src={p.image_url}
                          alt=""
                          fill
                          sizes="150px"
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    ) : (
                      <div className="featured-img featured-img-placeholder" aria-hidden="true">
                        🍷
                      </div>
                    )}
                    <span className="featured-badge">{t("menu.featuredBadge")}</span>
                    <span className="featured-name">{p.name}</span>
                    <span className="featured-price">{Number(p.price).toFixed(2)}€</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="cat-grid" role="list">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="cat-card"
                role="listitem"
                aria-label={`${cat.name} — ${countSubtreeProducts(cat as unknown as CategoryNode<Category>)} ${t("menu.dishes")}`}
                onClick={() => goInto(cat.slug)}
              >
                <div className="cat-icon-wrap">
                  {cat.image_url ? (
                    <img
                      src={cat.image_url}
                      alt=""
                      className="cat-image-lg"
                      loading="lazy"
                    />
                  ) : (
                    <span className="cat-icon-lg" aria-hidden="true">
                      {cat.icon || "🍷"}
                    </span>
                  )}
                </div>
                <h3>{cat.name}</h3>
                <span className="cat-count">
                  {countSubtreeProducts(cat as unknown as CategoryNode<Category>)}{" "}
                  {t("menu.dishes")}
                </span>
              </button>
            ))}
          </div>
        </main>
      )}

      {/* VISTA NAVEGACIÓN: subcategorías o productos de la categoría actual */}
      {(!atRoot || search) && (
        <>
          {/* Navegación de retorno + breadcrumb (solo si no hay búsqueda) */}
          {!search && (
            <nav className="category-nav" aria-label={t("menu.backToCategories")}>
              <button
                className="category-item back-btn"
                onClick={categoryPath.length > 1 ? goBack : goHome}
              >
                <ArrowLeft size={16} />
                <span>{t("menu.backToCategories")}</span>
              </button>
              {breadcrumb.length > 0 && (
                <ol className="breadcrumb" aria-label="breadcrumb">
                  {breadcrumb.map((b, i) => {
                    const isLast = i === breadcrumb.length - 1;
                    return (
                      <li key={b.id} aria-current={isLast ? "page" : undefined}>
                        {i > 0 && (
                          <span className="crumb-sep" aria-hidden="true">
                            ›
                          </span>
                        )}
                        {isLast ? (
                          <span className="crumb current">{b.name}</span>
                        ) : (
                          <button type="button" className="crumb" onClick={() => goToDepth(i + 1)}>
                            {b.name}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </nav>
          )}

          {/* Chips de filtro por tipo de vino — sólo si la categoría tiene vinos */}
          {!search && currentHasWines && !showGrid && (
            <div className="wine-filters" role="radiogroup" aria-label={t("menu.filtersTitle")}>
              <button
                type="button"
                role="radio"
                aria-checked={wineFilter === "all"}
                className={`wine-chip ${wineFilter === "all" ? "active" : ""}`}
                onClick={() => setWineFilter("all")}
              >
                {t("menu.filtersAll")}
              </button>
              {WINE_TYPES.map((wt) => (
                <button
                  key={wt.key}
                  type="button"
                  role="radio"
                  aria-checked={wineFilter === wt.key}
                  className={`wine-chip ${wineFilter === wt.key ? "active" : ""}`}
                  onClick={() => setWineFilter(wt.key)}
                >
                  {t(wt.labelKey)}
                </button>
              ))}
            </div>
          )}

          <main id="main" className="menu-list">
            {/* Modo búsqueda: lista plana de resultados */}
            {search &&
              searchResults.map((p) => {
                const qty = getQty(p.id);
                return (
                  <div
                    key={p.id}
                    className="product-card"
                    onClick={() => openProduct(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openProduct(p);
                      }
                    }}
                  >
                    <div className={`product-info ${p.image_url ? "has-img" : ""}`}>
                      <h3>{p.name}</h3>
                      <p className="product-desc">{p.description}</p>
                      {p.allergen_ids?.length > 0 && (
                        <div className="allergens" aria-label={t("menu.allergensLabel")}>
                          {p.allergen_ids.map((id: number) => (
                            <span key={id} className="allergen-icon" aria-hidden="true">
                              {ALLERGEN_ICONS[id] ?? "⚠️"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="product-action">
                      {p.image_url && (
                        <div className="product-img-wrap">
                          <Image
                            src={p.image_url}
                            alt={p.name}
                            fill
                            sizes="90px"
                            style={{ objectFit: "cover" }}
                          />
                        </div>
                      )}
                      <span className="price">{Number(p.price).toFixed(2)}€</span>
                      <div
                        className={`qty-controls ${qty === 0 ? "empty" : "filled"}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {qty > 0 && (
                          <>
                            <button
                              type="button"
                              className="qty-btn"
                              aria-label={t("menu.decreaseQty")}
                              onClick={() => {
                                const match = items.find(
                                  (i) => i.id === p.id || String(i.id).startsWith(p.id + "_")
                                );
                                if (match) removeItem(match.id);
                              }}
                            >
                              <Minus size={16} aria-hidden="true" />
                            </button>
                            <span className="qty-num" aria-live="polite">
                              {qty}
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          className="add-btn"
                          aria-label={t("menu.increaseQty")}
                          onClick={() => openProduct(p)}
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Modo navegación: subcategorías como grid + productos directos */}
            {!search && !atRoot && currentCategory && (
              <>
                {showGrid && (
                  <div className="cat-grid cat-grid-sub" role="list">
                    {currentChildren.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        className="cat-card"
                        role="listitem"
                        aria-label={`${child.name} — ${countSubtreeProducts(child as unknown as CategoryNode<Category>)} ${t("menu.dishes")}`}
                        onClick={() => goInto(child.slug)}
                      >
                        <div className="cat-icon-wrap">
                          {child.image_url ? (
                            <img
                              src={child.image_url}
                              alt=""
                              className="cat-image-lg"
                              loading="lazy"
                            />
                          ) : (
                            <span className="cat-icon-lg" aria-hidden="true">
                              {child.icon || "🍷"}
                            </span>
                          )}
                        </div>
                        <h3>{child.name}</h3>
                        <span className="cat-count">
                          {countSubtreeProducts(child as unknown as CategoryNode<Category>)}{" "}
                          {t("menu.dishes")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {currentCategory.products.length > 0 && (
                  <CategoryMenuSection
                    cat={currentCategory}
                    getQty={getQty}
                    openProduct={openProduct}
                    items={items}
                    removeItem={removeItem}
                    labels={{
                      decrease: t("menu.decreaseQty"),
                      increase: t("menu.increaseQty"),
                    }}
                    renderChildren={false}
                  />
                )}
              </>
            )}

            {search && searchResults.length === 0 && (
              <div className="empty-search">
                <ShoppingBag size={48} color="var(--text-muted)" />
                <p>Sin resultados para &ldquo;{search}&rdquo;</p>
              </div>
            )}
            {!search && !atRoot && !currentCategory && !loading && (
              <div className="empty-search">
                <ShoppingBag size={48} color="var(--text-muted)" />
                <p>
                  La carta está vacía. Añade categorías y productos desde el panel de
                  administración.
                </p>
              </div>
            )}
          </main>
        </>
      )}

      {/* Modal de producto */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)} role="presentation">
          <div
            ref={productDialogRef}
            className="modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setSelectedProduct(null)}
              aria-label={t("menu.close")}
            >
              <X size={20} aria-hidden="true" />
            </button>
            {selectedProduct.image_url && (
              <div className="modal-img">
                <Image
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name}
                  fill
                  sizes="(max-width: 500px) 100vw, 500px"
                  style={{ objectFit: "cover" }}
                />
              </div>
            )}
            <div className="modal-body">
              <h2 id="product-dialog-title">{selectedProduct.name}</h2>

              {/* Meta de vino — solo si es un vino */}
              {selectedProduct.wine_type && (
                <div className="wine-meta">
                  {selectedProduct.wine_region && (
                    <span className="wine-meta-item">
                      <span className="wine-meta-label">{t("menu.wineRegion")}</span>{" "}
                      {selectedProduct.wine_region}
                    </span>
                  )}
                  {selectedProduct.wine_vintage && (
                    <span className="wine-meta-item">
                      <span className="wine-meta-label">{t("menu.wineVintage")}</span>{" "}
                      {selectedProduct.wine_vintage}
                    </span>
                  )}
                  {selectedProduct.wine_grapes && selectedProduct.wine_grapes.length > 0 && (
                    <span className="wine-meta-item">
                      <span className="wine-meta-label">{t("menu.wineGrapes")}</span>{" "}
                      {selectedProduct.wine_grapes.join(", ")}
                    </span>
                  )}
                </div>
              )}

              <p className="modal-desc">{selectedProduct.description}</p>

              {/* Nota de cata */}
              {selectedProduct.tasting_notes && (
                <div className="tasting-notes">
                  <span className="tasting-notes-title">{t("menu.tastingNotes")}</span>
                  <p>{selectedProduct.tasting_notes}</p>
                </div>
              )}

              {/* Barras cuerpo / acidez / dulzor */}
              {(selectedProduct.wine_body ||
                selectedProduct.wine_acidity ||
                selectedProduct.wine_sweetness) && (
                <dl className="wine-scales">
                  {(
                    [
                      ["menu.wineBody", selectedProduct.wine_body],
                      ["menu.wineAcidity", selectedProduct.wine_acidity],
                      ["menu.wineSweetness", selectedProduct.wine_sweetness],
                    ] as const
                  )
                    .filter(([, v]) => v != null)
                    .map(([labelKey, value]) => (
                      <div key={labelKey} className="scale-row">
                        <dt>{t(labelKey)}</dt>
                        <dd aria-label={`${value} ${t("of")} 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span
                              key={n}
                              className={`scale-dot ${n <= (value ?? 0) ? "on" : ""}`}
                              aria-hidden="true"
                            />
                          ))}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}

              <p className="modal-price">{Number(selectedProduct.price).toFixed(2)}€</p>

              {selectedProduct.product_extras?.length > 0 && (
                <div className="extras-section">
                  <p className="extras-title">{t("menu.extras")}</p>
                  {selectedProduct.product_extras.map((ex) => (
                    <label key={ex.id} className="extra-item">
                      <input
                        type="checkbox"
                        checked={selectedExtras.some((e) => e.id === ex.id)}
                        onChange={() =>
                          setSelectedExtras((prev) =>
                            prev.some((e) => e.id === ex.id)
                              ? prev.filter((e) => e.id !== ex.id)
                              : [...prev, ex]
                          )
                        }
                      />
                      <span>{ex.name}</span>
                      {ex.price > 0 && <span className="extra-price">+{ex.price.toFixed(2)}€</span>}
                    </label>
                  ))}
                </div>
              )}

              <div className="product-note-section">
                <label htmlFor="product-note" className="product-note-label">
                  {t("menu.notesTitle")}
                </label>
                <textarea
                  id="product-note"
                  className="product-note-input"
                  placeholder={t("menu.notesPlaceholder")}
                  value={productNote}
                  onChange={(e) => setProductNote(e.target.value)}
                  maxLength={200}
                  rows={2}
                />
              </div>

              <button className="gold-button modal-add-btn" onClick={confirmAdd}>
                {t("menu.addToOrder")} —{" "}
                {(
                  Number(selectedProduct.price) + selectedExtras.reduce((s, e) => s + e.price, 0)
                ).toFixed(2)}
                €
              </button>

              {/* Maridajes: vinos sugeridos para este plato */}
              {selectedPairings.length > 0 && (
                <section className="pairings-section" aria-labelledby="pairings-title">
                  <h3 id="pairings-title" className="pairings-title">
                    {t("menu.pairingsTitle")}
                  </h3>
                  <div className="pairings-scroll" role="list">
                    {selectedPairings.map((wine) => (
                      <button
                        key={wine.id}
                        type="button"
                        role="listitem"
                        className="pairing-card"
                        onClick={() => {
                          setSelectedExtras([]);
                          setProductNote("");
                          setSelectedProduct(wine);
                        }}
                        aria-label={`${wine.name} — ${Number(wine.price).toFixed(2)}€`}
                      >
                        {wine.image_url ? (
                          <div className="pairing-img">
                            <Image
                              src={wine.image_url}
                              alt=""
                              fill
                              sizes="80px"
                              style={{ objectFit: "cover" }}
                            />
                          </div>
                        ) : (
                          <div className="pairing-img pairing-img-placeholder" aria-hidden="true">
                            🍷
                          </div>
                        )}
                        <span className="pairing-name">{wine.name}</span>
                        <span className="pairing-price">{Number(wine.price).toFixed(2)}€</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de pago — Stripe Payment Element (Apple Pay, Google Pay, Bizum, tarjeta) */}
      <CheckoutDialog
        open={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={items}
        mesa={mesa}
        totalAmount={totalAmount}
        labels={{
          title: t("menu.checkoutTitle"),
          subtitle: t("menu.checkoutSubtitle"),
          payNow: t("menu.payNow"),
          close: t("menu.close"),
          errorGeneric: t("menu.payErrorGeneric"),
        }}
      />

      {/* Toast de error de pago — aria-live para lectores de pantalla */}
      {payError && (
        <div className="pay-error-toast" role="alert" aria-live="assertive">
          <span>{payError}</span>
          <button type="button" onClick={() => setPayError("")} aria-label={t("menu.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Carrito flotante */}
      {totalQuantity > 0 && (
        <div className="footer-cart-wrap">
          <button
            type="button"
            className="footer-cart glass"
            onClick={() => setIsCartOpen(true)}
            aria-label={`${t("menu.openCart")} — ${totalAmount.toFixed(2)}€`}
          >
            <div className="cart-summary">
              <div className="cart-text">
                <strong>{t("menu.myOrder")}</strong>
                <p>
                  {totalQuantity} {totalQuantity === 1 ? t("menu.product") : t("menu.products")}
                </p>
              </div>
              <div className="cart-right">
                <span className="cart-total-mini">{totalAmount.toFixed(2)}€</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="gold-button pay-btn-small"
                  aria-label={t("menu.pay")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCheckout();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    handleCheckout();
                  }}
                >
                  {t("menu.pay")}
                </span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Modal del Carrito Detallado */}
      {isCartOpen && (
        <div
          className="modal-overlay cart-overlay"
          onClick={() => setIsCartOpen(false)}
          role="presentation"
        >
          <div
            ref={cartDialogRef}
            className="modal cart-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-modal-header">
              <h3 id="cart-dialog-title">{t("menu.currentOrder")}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setIsCartOpen(false)}
                aria-label={t("menu.close")}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="cart-items-list">
              {items.map((item) => (
                <div key={item.id} className="cart-item">
                  <div className="item-details">
                    <span className="item-name">{item.name}</span>
                    {item.note && <span className="item-note">“{item.note}”</span>}
                    <span className="item-price-unit">{item.price.toFixed(2)}€ / ud.</span>
                  </div>
                  <div className="item-actions">
                    <div className="qty-controls filled">
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => removeItem(item.id)}
                        aria-label={t("menu.decreaseQty")}
                      >
                        <Minus size={14} aria-hidden="true" />
                      </button>
                      <span className="qty-num" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="add-btn"
                        onClick={() => addItem(item)}
                        aria-label={t("menu.increaseQty")}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <span className="item-subtotal">
                      {(item.price * item.quantity).toFixed(2)}€
                    </span>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="empty-cart-msg">
                  <ShoppingBag size={40} color="var(--text-muted)" aria-hidden="true" />
                  <p>{t("menu.emptyCart")}</p>
                  <button
                    type="button"
                    className="empty-cart-cta"
                    onClick={() => setIsCartOpen(false)}
                  >
                    {t("menu.emptyCartCta")}
                  </button>
                </div>
              )}
            </div>

            <div className="cart-modal-footer">
              <div className="total-row">
                <span>TOTAL</span>
                <span>{totalAmount.toFixed(2)}€</span>
              </div>
              <button
                className="gold-button pay-btn-full"
                onClick={handleCheckout}
                disabled={items.length === 0}
              >
                {t("menu.confirmAndPay")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .menu-container {
          min-height: 100vh;
          padding-top: calc(86px + env(safe-area-inset-top));
          padding-bottom: calc(120px + env(safe-area-inset-bottom));
          background: transparent;
        }

        .navbar {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          z-index: 100;
          border-bottom: 1px solid var(--border);
          padding-top: env(safe-area-inset-top);
        }
        .navbar-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.8rem max(1.2rem, env(safe-area-inset-right)) 0.8rem
            max(1.2rem, env(safe-area-inset-left));
          max-width: 800px;
          margin: 0 auto;
        }
        .brand {
          display: flex;
          align-items: center;
        }
        .nav-logo-img {
          height: 82px;
          width: auto;
          display: block;
        }
        @media (max-width: 600px) {
          .navbar-content {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 0.4rem;
            padding: 0.4rem max(0.8rem, env(safe-area-inset-right)) 0.4rem
              max(0.8rem, env(safe-area-inset-left));
          }
          .brand {
            grid-column: 2;
            justify-self: center;
          }
          .nav-logo-img {
            height: 56px;
          }
          .navbar-right {
            grid-column: 3;
            justify-self: end;
            gap: 0.4rem;
          }
          .table-badge {
            font-size: 0.65rem;
            padding: 0.25rem 0.5rem;
          }
          .icon-btn {
            width: 38px;
            height: 38px;
          }
        }
        @media (max-width: 600px) {
          .menu-container {
            padding-top: calc(73px + env(safe-area-inset-top));
          }
        }
        @media (max-width: 360px) {
          .nav-logo-img {
            height: 48px;
          }
          .table-badge {
            display: none;
          }
        }
        .brand h1 {
          font-size: 1.6rem;
          margin: 0;
          letter-spacing: 0.12em;
        }
        .navbar-right {
          display: flex;
          align-items: center;
          gap: 0.8rem;
        }
        .table-badge {
          font-size: 0.75rem;
          background: var(--primary);
          color: #fff;
          padding: 0.35rem 0.7rem;
          border-radius: 6px;
          font-weight: 800;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .icon-btn {
          background: none;
          border: none;
          color: var(--text);
          cursor: pointer;
          display: flex;
          width: 44px;
          height: 44px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .icon-btn:hover {
          background: var(--primary-light);
        }
        .search-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.2rem 0.8rem;
          max-width: 800px;
          margin: 0 auto;
        }
        .search-bar input {
          flex: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.6rem 1rem;
          color: var(--text);
          font-size: 0.95rem;
          outline: none;
        }
        .search-bar input:focus {
          border-color: var(--primary);
        }

        .category-nav {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem 1.2rem;
          overflow-x: auto;
          scrollbar-width: none;
          position: sticky;
          top: calc(86px + env(safe-area-inset-top));
          background: var(--surface);
          z-index: 90;
          border-bottom: 1px solid var(--border);
          align-items: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
        }
        @media (max-width: 600px) {
          .category-nav {
            top: calc(73px + env(safe-area-inset-top));
            padding: 0.6rem 1rem;
          }
        }
        .category-nav::-webkit-scrollbar {
          display: none;
        }
        .nav-divider {
          width: 1px;
          height: 24px;
          background: var(--border);
          margin: 0 0.4rem;
          flex-shrink: 0;
        }
        .back-btn {
          background: var(--primary) !important;
          color: #fff !important;
          border: 1px solid var(--primary) !important;
          padding: 0.5rem 1rem !important;
          font-weight: 600 !important;
          font-size: 0.85rem !important;
          border-radius: 999px !important;
          box-shadow: 0 4px 12px rgba(123, 79, 150, 0.25);
          flex-shrink: 0;
          cursor: pointer;
          transition: all 0.2s ease;
          min-height: 40px;
        }
        .back-btn:hover {
          background: var(--primary-hover) !important;
          border-color: var(--primary-hover) !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(123, 79, 150, 0.32);
        }
        .back-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 6px rgba(123, 79, 150, 0.2);
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 0.8rem;
          color: var(--text-muted);
          flex-wrap: nowrap;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .breadcrumb::-webkit-scrollbar {
          display: none;
        }
        .breadcrumb li {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          white-space: nowrap;
        }
        .crumb {
          background: none;
          border: none;
          padding: 0.2rem 0.3rem;
          color: var(--text-muted);
          cursor: pointer;
          font-size: inherit;
          font-family: inherit;
          border-radius: 6px;
          transition: all 0.15s;
        }
        .crumb:hover {
          color: var(--primary);
          background: var(--primary-light);
        }
        .crumb.current {
          color: var(--primary);
          font-weight: 700;
          padding: 0.2rem 0.3rem;
        }
        .crumb-sep {
          color: var(--text-muted);
          opacity: 0.6;
        }

        .cat-grid-sub {
          margin-bottom: 1.5rem;
        }

        .category-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 1.1rem;
          background: var(--surface);
          border-radius: 30px;
          border: 1px solid var(--border);
          white-space: nowrap;
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.85rem;
          transition: all 0.2s;
          cursor: pointer;
        }
        .category-item.active {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-light);
        }

        .categories-grid-view {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1.2rem;
          position: relative;
          z-index: 1;
        }
        .welcome-header {
          text-align: center;
          margin-bottom: 2.5rem;
          background: var(--surface);
          border-radius: 14px;
          padding: 1.5rem 1.5rem 1rem;
          box-shadow: 0 2px 16px rgba(0, 0, 0, 0.05);
        }
        .welcome-header h2 {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
          color: var(--text);
        }
        .welcome-header p {
          color: var(--text-muted);
          font-size: 0.95rem;
        }

        .cat-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }
        @media (min-width: 640px) {
          .cat-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .cat-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        .cat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 1.5rem 1rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--card-shadow);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          font-family: inherit;
          color: inherit;
          width: 100%;
          min-height: 44px;
        }
        .cat-card:hover {
          border-color: var(--primary);
          transform: translateY(-5px);
          box-shadow: 0 12px 24px rgba(123, 29, 46, 0.1);
        }
        .cat-card:active {
          transform: scale(0.96);
        }

        .cat-icon-wrap {
          width: 60px;
          height: 60px;
          background: var(--primary-light);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.2rem;
          overflow: hidden;
        }
        .cat-icon-lg {
          font-size: 2rem;
        }
        .cat-image-lg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .cat-card h3 {
          font-family: var(--font-playfair);
          font-size: 1.1rem;
          margin: 0;
          color: var(--text);
        }
        .cat-count {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .menu-list {
          max-width: 800px;
          margin: 0 auto;
          padding: 2.5rem 1rem 1.5rem;
          position: relative;
          z-index: 1;
        }

        /* Estilos de tarjeta de producto para resultados de búsqueda (inline en MesaPage) */
        .product-card {
          background: #fff;
          padding: 1.5rem;
          border-radius: 24px;
          border: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 1.2rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.03);
          position: relative;
        }
        .product-card:active {
          transform: scale(0.98);
        }
        .product-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 40px rgba(123, 29, 46, 0.08);
        }
        .product-info {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .product-info h3 {
          margin: 0;
          font-size: 1.25rem;
          color: #222;
          font-family: var(--font-playfair);
          font-weight: 800;
        }
        .product-desc {
          font-size: 0.85rem;
          color: #777;
          margin: 0;
          line-height: 1.5;
          height: 3em;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .allergens {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-top: 0.2rem;
        }
        .allergen-icon {
          font-size: 0.9rem;
        }
        .product-info.has-img {
          padding-right: 110px;
          min-height: 90px;
        }
        .product-action {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 0.5rem;
        }
        .product-img-wrap {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          width: 90px;
          height: 90px;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
          background: #fff;
          padding: 4px;
          border: 1px solid rgba(0, 0, 0, 0.03);
        }
        .product-img-wrap :global(img) {
          border-radius: 14px;
        }
        .price {
          font-weight: 500;
          color: #222;
          font-size: 1.05rem;
        }
        .qty-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 30px;
          transition: all 0.2s;
        }
        .qty-controls.filled {
          background: #fff;
          border: 1px solid rgba(123, 29, 46, 0.2);
          padding: 0.2rem 0.4rem;
          gap: 0.5rem;
          box-shadow: 0 4px 10px rgba(123, 29, 46, 0.05);
        }
        .qty-controls.empty {
          border: none;
          background: transparent;
          padding: 0;
          gap: 0;
        }
        .qty-num {
          font-weight: 800;
          min-width: 18px;
          text-align: center;
          color: #222;
          font-size: 1rem;
        }
        .qty-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: none;
          background: none;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .add-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 1px solid rgba(123, 29, 46, 0.4);
          background: none;
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .qty-controls.filled .add-btn {
          width: 34px;
          height: 34px;
          border: none;
          background: none;
        }
        .qty-controls.empty .add-btn:hover {
          background: rgba(123, 29, 46, 0.05);
          border-color: var(--primary);
        }

        .empty-search {
          text-align: center;
          padding: 4rem 1rem;
          color: var(--text-muted);
        }

        /* ── Recomendados de la casa ─────────────────────────────────── */
        .featured-section {
          margin: 0 0 2.5rem;
        }
        .featured-title {
          font-size: 1.1rem;
          margin: 0 0 0.9rem;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding-left: 0.2rem;
        }
        .featured-title::before {
          content: "";
          width: 3px;
          height: 18px;
          background: var(--primary);
          border-radius: 2px;
        }
        .featured-scroll {
          display: flex;
          gap: 0.9rem;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding: 0.3rem 0.1rem 1rem;
          margin: 0 -0.3rem;
          scrollbar-width: none;
        }
        .featured-scroll::-webkit-scrollbar {
          display: none;
        }
        .featured-card {
          flex: 0 0 160px;
          scroll-snap-align: start;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 0.7rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          color: inherit;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
          position: relative;
        }
        .featured-card:active {
          transform: scale(0.98);
        }
        .featured-img {
          position: relative;
          width: 100%;
          aspect-ratio: 1/1;
          border-radius: 12px;
          overflow: hidden;
          background: var(--primary-light);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
        }
        .featured-img-placeholder {
          background: var(--primary-light);
        }
        .featured-badge {
          position: absolute;
          top: 0.9rem;
          left: 0.9rem;
          background: var(--primary);
          color: #fff;
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }
        .featured-name {
          font-family: var(--font-playfair);
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text);
          margin-top: 0.2rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.25;
        }
        .featured-price {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--primary);
        }

        /* ── Chips de filtro de vino ─────────────────────────────────── */
        .wine-filters {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding: 0.8rem 1.2rem 0.5rem;
          max-width: 800px;
          margin: 0 auto;
          scrollbar-width: none;
        }
        .wine-filters::-webkit-scrollbar {
          display: none;
        }
        .wine-chip {
          flex-shrink: 0;
          background: #fff;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 0.5rem 1rem;
          border-radius: 30px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .wine-chip:hover {
          border-color: var(--primary);
          color: var(--primary);
        }
        .wine-chip.active {
          background: var(--primary);
          color: #fff;
          border-color: var(--primary);
          box-shadow: 0 4px 12px rgba(123, 79, 150, 0.25);
        }

        /* ── Ficha de vino: metadata + nota de cata + escalas ────────── */
        .wine-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem 0.9rem;
          margin: -0.2rem 0 0.3rem;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .wine-meta-item {
          display: inline-flex;
          gap: 0.3rem;
          align-items: baseline;
        }
        .wine-meta-label {
          font-weight: 700;
          color: var(--primary);
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .tasting-notes {
          background: var(--primary-light);
          border-left: 3px solid var(--primary);
          border-radius: 0 10px 10px 0;
          padding: 0.7rem 0.9rem;
          margin: 0.2rem 0;
        }
        .tasting-notes-title {
          font-size: 0.68rem;
          font-weight: 800;
          color: var(--primary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: block;
          margin-bottom: 0.2rem;
        }
        .tasting-notes p {
          font-size: 0.88rem;
          color: var(--text);
          margin: 0;
          line-height: 1.5;
          font-style: italic;
        }
        .wine-scales {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin: 0.2rem 0 0.1rem;
        }
        .scale-row {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          font-size: 0.82rem;
        }
        .scale-row dt {
          color: var(--text-muted);
          font-weight: 600;
          min-width: 70px;
        }
        .scale-row dd {
          margin: 0;
          display: flex;
          gap: 0.25rem;
        }
        .scale-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(123, 79, 150, 0.15);
          display: inline-block;
        }
        .scale-dot.on {
          background: var(--primary);
        }

        /* ── Maridajes ───────────────────────────────────────────────── */
        .pairings-section {
          margin-top: 1rem;
          border-top: 1px solid var(--border);
          padding-top: 1rem;
        }
        .pairings-title {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0 0 0.7rem;
        }
        .pairings-scroll {
          display: flex;
          gap: 0.7rem;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 0.3rem;
          margin: 0 -0.2rem;
        }
        .pairings-scroll::-webkit-scrollbar {
          display: none;
        }
        .pairing-card {
          flex: 0 0 120px;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          cursor: pointer;
          font-family: inherit;
          color: inherit;
          text-align: left;
        }
        .pairing-card:active {
          transform: scale(0.97);
        }
        .pairing-img {
          position: relative;
          width: 100%;
          aspect-ratio: 1/1;
          border-radius: 10px;
          overflow: hidden;
          background: var(--primary-light);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
        }
        .pairing-name {
          font-family: var(--font-playfair);
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.2;
        }
        .pairing-price {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--primary);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 200;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
          overscroll-behavior: contain;
        }
        .modal {
          width: 100%;
          max-width: 500px;
          border-radius: 24px 24px 16px 16px;
          overflow: hidden;
          border: 1px solid var(--border);
          position: relative;
        }
        .modal-close-btn {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          z-index: 2;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        }
        .modal-close-btn:hover {
          background: #fff;
        }
        .modal-img {
          position: relative;
          width: 100%;
          height: 220px;
        }
        .modal-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: var(--surface);
        }
        .modal-body h2 {
          margin: 0;
          font-size: 1.4rem;
          font-family: var(--font-playfair);
          color: var(--text);
        }
        .modal-desc {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin: 0;
          line-height: 1.5;
        }
        .modal-price {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--primary);
          margin: 0;
        }
        .extras-section {
          border-top: 1px solid var(--border);
          padding-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .extras-title {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin: 0;
        }
        .extra-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.9rem;
          cursor: pointer;
          color: var(--text);
        }
        .extra-item input {
          accent-color: var(--primary);
        }
        .extra-price {
          margin-left: auto;
          color: var(--primary);
          font-size: 0.85rem;
        }
        .product-note-section {
          border-top: 1px solid var(--border);
          padding-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .product-note-label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .product-note-input {
          width: 100%;
          font-family: inherit;
          font-size: 0.95rem;
          color: var(--text);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.6rem 0.75rem;
          resize: vertical;
          min-height: 2.5rem;
          line-height: 1.35;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .product-note-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-light);
        }
        .modal-add-btn {
          width: 100%;
          justify-content: center;
          margin-top: 0.5rem;
        }

        .pay-error-toast {
          position: fixed;
          left: 50%;
          bottom: calc(6.5rem + env(safe-area-inset-bottom));
          transform: translateX(-50%);
          width: calc(100% - 2rem);
          max-width: 440px;
          background: #8b1e1e;
          color: #fff;
          padding: 0.9rem 1.2rem;
          border-radius: 12px;
          font-size: 0.9rem;
          line-height: 1.4;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          justify-content: space-between;
          box-shadow: 0 10px 30px rgba(139, 30, 30, 0.35);
          z-index: 150;
        }
        .pay-error-toast button {
          background: rgba(139, 30, 30, 0.6);
          border: none;
          color: #fff;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pay-error-toast button:hover {
          background: rgba(139, 30, 30, 0.85);
        }

        .footer-cart-wrap {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0 1rem max(1.5rem, env(safe-area-inset-bottom));
          display: flex;
          justify-content: center;
          pointer-events: none;
          z-index: 100;
        }
        .footer-cart {
          pointer-events: auto;
          width: 100%;
          max-width: 480px;
          padding: 1rem 1.2rem;
          border-radius: 18px;
          box-shadow: 0 10px 40px rgba(123, 29, 46, 0.25);
          cursor: pointer;
          border: none;
          font-family: inherit;
          color: inherit;
          text-align: left;
        }
        .cart-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cart-text p {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 0;
        }
        .cart-text strong {
          font-size: 0.95rem;
          color: var(--text);
        }
        .cart-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .cart-total-mini {
          font-weight: 800;
          color: var(--primary);
          font-size: 1.1rem;
        }
        .pay-btn-small {
          padding: 0.6rem 1.2rem;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
        }

        /* Estilos del Modal del Carrito */
        .cart-modal {
          height: 80vh;
          max-height: 700px;
          display: flex;
          flex-direction: column;
          background: #fff;
        }
        .cart-modal-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cart-modal-header h3 {
          margin: 0;
          font-family: var(--font-playfair);
          font-size: 1.3rem;
        }
        .close-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }

        .cart-items-list {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
        }
        .cart-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #fafafa;
          padding-bottom: 1rem;
        }
        .item-details {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .item-name {
          font-weight: 600;
          color: var(--text);
          font-size: 1rem;
        }
        .item-price-unit {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .item-note {
          font-size: 0.85rem;
          color: var(--secondary);
          font-style: italic;
          line-height: 1.3;
        }

        .item-actions {
          display: flex;
          align-items: center;
          gap: 1.2rem;
        }
        .item-subtotal {
          font-weight: 700;
          color: var(--text);
          min-width: 60px;
          text-align: right;
        }

        .empty-cart-msg {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 3rem 1rem;
          color: var(--text-muted);
          text-align: center;
        }
        .empty-cart-cta {
          margin-top: 0.25rem;
          background: none;
          border: 1px solid var(--primary);
          color: var(--primary);
          padding: 0.6rem 1.2rem;
          border-radius: 30px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
        }
        .empty-cart-cta:hover {
          background: var(--primary-light);
        }

        .cart-modal-footer {
          padding: 1.5rem;
          border-top: 1px solid var(--border);
          background: #fafafa;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.2rem;
          font-weight: 800;
          font-size: 1.2rem;
        }
        .pay-btn-full {
          width: 100%;
          justify-content: center;
          padding: 1.1rem;
          font-size: 1rem;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
