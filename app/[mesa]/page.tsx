"use client";

import { useEffect, useState, use } from 'react';
import { Search, Loader2, Plus, Minus, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';

const ALLERGEN_ICONS: Record<number, string> = {
  1:'🌾', 2:'🦞', 3:'🥚', 4:'🐟', 5:'🥜', 6:'🌱',
  7:'🥛', 8:'🌰', 9:'🌿', 10:'🟡', 11:'🌰', 12:'💨', 13:'🌻', 14:'🐚',
};

type Extra   = { id: string; name: string; price: number };
type Product = { id: string; name: string; description: string; price: number; image_url: string | null; allergen_ids: number[]; product_extras: Extra[] };
type Category = { id: string; name: string; slug: string; icon: string; products: Product[] };

export default function MesaPage({ params }: { params: Promise<{ mesa: string }> }) {
  const { mesa } = use(params);

  const [categories, setCategories]           = useState<Category[]>([]);
  const [activeCategory, setActiveCategory]   = useState('');
  const [search, setSearch]                   = useState('');
  const [showSearch, setShowSearch]           = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedExtras, setSelectedExtras]   = useState<Extra[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [paying, setPaying]                   = useState(false);

  const { addItem, items, totalQuantity, totalAmount, removeItem } = useCart();
  const getQty = (id: string) => items.find(i => i.id === id)?.quantity ?? 0;

  useEffect(() => {
    supabase
      .from('categories')
      .select('*, products(*, product_extras(*))')
      .order('sort_order')
      .then(({ data }) => {
        if (data?.length) {
          setCategories(data as Category[]);
          setActiveCategory(data[0].slug);
        }
        setLoading(false);
      });
  }, []);

  const handleCheckout = async () => {
    if (!items.length) return;
    setPaying(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, mesa }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      alert('Error al procesar el pago: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setPaying(false);
    }
  };

  const openProduct = (p: Product) => { setSelectedProduct(p); setSelectedExtras([]); };

  const confirmAdd = () => {
    if (!selectedProduct) return;
    const extra = selectedExtras.reduce((s, e) => s + e.price, 0);
    addItem({
      id: selectedProduct.id + (selectedExtras.length ? '_' + selectedExtras.map(e => e.id).join('_') : ''),
      name: selectedProduct.name + (selectedExtras.length ? ` (${selectedExtras.map(e => e.name).join(', ')})` : ''),
      price: Number(selectedProduct.price) + extra,
    });
    setSelectedProduct(null);
  };

  const filteredCategories = categories.map(cat => ({
    ...cat,
    products: cat.products.filter(p =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => !search || cat.products.length > 0);

  if (loading) return (
    <div className="loading-screen">
      <Loader2 size={40} className="spin" />
      <style jsx>{`
        .loading-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--background); }
        .spin { animation:spin 1s linear infinite; color:var(--primary); }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );

  return (
    <div className="menu-container">

      {/* Navbar */}
      <header className="navbar glass">
        <div className="navbar-content">
          <div className="brand">
            <h1 className="gold-text">GARUM</h1>
            <small className="brand-sub serif">Vinoteca &amp; Cocina</small>
          </div>
          <div className="navbar-right">
            <span className="table-badge">MESA {mesa}</span>
            <button className="icon-btn" onClick={() => setShowSearch(s => !s)}>
              <Search size={22} />
            </button>
          </div>
        </div>
        {showSearch && (
          <div className="search-bar">
            <Search size={16} color="var(--text-muted)" />
            <input
              autoFocus
              placeholder="Buscar plato o bebida..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
      </header>

      {/* Categorías */}
      {!search && (
        <nav className="category-nav">
          {categories.map(cat => (
            <a
              key={cat.slug}
              href={`#${cat.slug}`}
              onClick={() => setActiveCategory(cat.slug)}
              className={`category-item ${activeCategory === cat.slug ? 'active' : ''}`}
            >
              <span>{cat.name}</span>
            </a>
          ))}
        </nav>
      )}

      {/* Carta */}
      <main className="menu-list">
        {filteredCategories.map(cat => (
          <section key={cat.slug} id={cat.slug} className="section">
            <h2 className="section-title">{cat.name}</h2>
            <div className="products-list">
              {cat.products.map(p => {
                const qty = getQty(p.id);
                return (
                  <div key={p.id} className="product-card" onClick={() => openProduct(p)}>
                    <div className="product-info">
                      <h3>{p.name}</h3>
                      <p className="product-desc">{p.description}</p>
                      {p.allergen_ids?.length > 0 && (
                        <div className="allergens">
                          {p.allergen_ids.map(id => (
                            <span key={id} className="allergen-icon">{ALLERGEN_ICONS[id]}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="product-action">
                      {p.image_url && (
                        <div className="product-img-wrap">
                          <Image src={p.image_url} alt={p.name} fill style={{ objectFit: 'cover' }} />
                        </div>
                      )}
                      <span className="price">{Number(p.price).toFixed(2)}€</span>
                      <div className="qty-controls" onClick={e => e.stopPropagation()}>
                        {qty > 0 && (
                          <>
                            <button className="qty-btn" onClick={() => removeItem(p.id)}><Minus size={14} /></button>
                            <span className="qty-num">{qty}</span>
                          </>
                        )}
                        <button className="add-btn" onClick={() => openProduct(p)}><Plus size={16} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {filteredCategories.length === 0 && search && (
          <div className="empty-search">
            <ShoppingBag size={48} color="var(--text-muted)" />
            <p>Sin resultados para &ldquo;{search}&rdquo;</p>
          </div>
        )}
        {filteredCategories.length === 0 && !search && !loading && (
          <div className="empty-search">
            <ShoppingBag size={48} color="var(--text-muted)" />
            <p>La carta está vacía. Añade categorías y productos desde el panel de administración.</p>
          </div>
        )}
      </main>

      {/* Modal de producto */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal glass" onClick={e => e.stopPropagation()}>
            {selectedProduct.image_url && (
              <div className="modal-img">
                <Image src={selectedProduct.image_url} alt={selectedProduct.name} fill style={{ objectFit: 'cover' }} />
              </div>
            )}
            <div className="modal-body">
              <h2>{selectedProduct.name}</h2>
              <p className="modal-desc">{selectedProduct.description}</p>
              <p className="modal-price">{Number(selectedProduct.price).toFixed(2)}€</p>

              {selectedProduct.product_extras?.length > 0 && (
                <div className="extras-section">
                  <p className="extras-title">Extras</p>
                  {selectedProduct.product_extras.map(ex => (
                    <label key={ex.id} className="extra-item">
                      <input
                        type="checkbox"
                        checked={selectedExtras.some(e => e.id === ex.id)}
                        onChange={() => setSelectedExtras(prev =>
                          prev.some(e => e.id === ex.id)
                            ? prev.filter(e => e.id !== ex.id)
                            : [...prev, ex]
                        )}
                      />
                      <span>{ex.name}</span>
                      {ex.price > 0 && <span className="extra-price">+{ex.price.toFixed(2)}€</span>}
                    </label>
                  ))}
                </div>
              )}

              <button className="gold-button modal-add-btn" onClick={confirmAdd}>
                Añadir al pedido — {(Number(selectedProduct.price) + selectedExtras.reduce((s,e) => s+e.price, 0)).toFixed(2)}€
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carrito flotante */}
      {totalQuantity > 0 && (
        <footer className="footer-cart glass">
          <div className="cart-summary">
            <div className="cart-text">
              <strong>Mi Pedido</strong>
              <p>{totalQuantity} {totalQuantity === 1 ? 'producto' : 'productos'}</p>
            </div>
            <button className="gold-button pay-btn" onClick={handleCheckout} disabled={paying}>
              {paying ? <Loader2 size={18} className="spin" /> : `PAGAR ${totalAmount.toFixed(2)}€`}
            </button>
          </div>
        </footer>
      )}

      <style jsx>{`
        .menu-container { min-height:100vh; padding-top:110px; padding-bottom:120px; background:var(--background); }

        .navbar { position:fixed; top:0; left:0; width:100%; z-index:100; border-bottom:1px solid var(--border); }
        .navbar-content { display:flex; justify-content:space-between; align-items:center; padding:1rem 1.2rem; max-width:800px; margin:0 auto; }
        .brand { display:flex; flex-direction:column; }
        .brand h1 { font-size:1.6rem; margin:0; letter-spacing:0.12em; }
        .brand-sub { font-size:0.65rem; color:var(--text-muted); letter-spacing:0.2em; text-transform:uppercase; }
        .navbar-right { display:flex; align-items:center; gap:0.8rem; }
        .table-badge { font-size:0.65rem; background:var(--primary); color:#fff; padding:0.2rem 0.6rem; border-radius:4px; font-weight:800; letter-spacing:0.08em; }
        .icon-btn { background:none; border:none; color:var(--text); cursor:pointer; display:flex; }
        .search-bar { display:flex; align-items:center; gap:0.5rem; padding:0.6rem 1.2rem 0.8rem; max-width:800px; margin:0 auto; }
        .search-bar input { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:0.6rem 1rem; color:var(--text); font-size:0.95rem; outline:none; }
        .search-bar input:focus { border-color:var(--primary); }

        .category-nav { display:flex; gap:0.6rem; padding:0.8rem 1.2rem; overflow-x:auto; scrollbar-width:none; position:sticky; top:72px; background:var(--background); z-index:90; border-bottom:1px solid var(--border); }
        .category-nav::-webkit-scrollbar { display:none; }
        .category-item { display:flex; align-items:center; gap:0.4rem; padding:0.45rem 1.1rem; background:var(--surface); border-radius:30px; border:1px solid var(--border); white-space:nowrap; color:var(--text-muted); text-decoration:none; font-size:0.85rem; transition:all 0.2s; }
        .category-item.active { border-color:var(--primary); color:var(--primary); background:var(--primary-light); }

        .menu-list { max-width:800px; margin:0 auto; padding:1.5rem 1rem; }
        .section { margin-bottom:3rem; }
        .section-title { font-size:1.5rem; margin-bottom:1rem; border-left:3px solid var(--primary); padding-left:0.8rem; font-family:var(--font-playfair); }
        .products-list { display:flex; flex-direction:column; gap:0.75rem; }

        .product-card { background:var(--surface); padding:1.2rem; border-radius:14px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; gap:1rem; cursor:pointer; transition:border-color 0.2s; box-shadow:var(--card-shadow); }
        .product-card:active { transform:scale(0.99); }
        .product-card:hover { border-color:var(--primary); }
        .product-info { flex:1; }
        .product-info h3 { margin:0 0 0.3rem; font-size:1.05rem; color:var(--text); }
        .product-desc { font-size:0.82rem; color:var(--text-muted); margin:0 0 0.4rem; line-height:1.4; }
        .allergens { display:flex; gap:0.2rem; flex-wrap:wrap; }
        .allergen-icon { font-size:0.85rem; }
        .product-action { display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem; flex-shrink:0; }
        .product-img-wrap { position:relative; width:70px; height:70px; border-radius:10px; overflow:hidden; }
        .price { font-weight:700; color:var(--primary); font-size:1rem; }
        .qty-controls { display:flex; align-items:center; gap:0.5rem; }
        .qty-num { font-weight:700; min-width:16px; text-align:center; color:var(--text); }
        .qty-btn { width:30px; height:30px; border-radius:50%; border:1px solid var(--border); background:none; color:var(--text-muted); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .add-btn { width:32px; height:32px; border-radius:50%; border:1px solid var(--primary); background:none; color:var(--primary); display:flex; align-items:center; justify-content:center; cursor:pointer; }

        .empty-search { text-align:center; padding:4rem 1rem; color:var(--text-muted); }

        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:200; display:flex; align-items:flex-end; justify-content:center; padding:1rem; }
        .modal { width:100%; max-width:500px; border-radius:24px 24px 16px 16px; overflow:hidden; border:1px solid var(--border); }
        .modal-img { position:relative; width:100%; height:220px; }
        .modal-body { padding:1.5rem; display:flex; flex-direction:column; gap:0.75rem; background:var(--surface); }
        .modal-body h2 { margin:0; font-size:1.4rem; font-family:var(--font-playfair); color:var(--text); }
        .modal-desc { color:var(--text-muted); font-size:0.9rem; margin:0; line-height:1.5; }
        .modal-price { font-size:1.4rem; font-weight:700; color:var(--primary); margin:0; }
        .extras-section { border-top:1px solid var(--border); padding-top:0.75rem; display:flex; flex-direction:column; gap:0.5rem; }
        .extras-title { font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin:0; }
        .extra-item { display:flex; align-items:center; gap:0.6rem; font-size:0.9rem; cursor:pointer; color:var(--text); }
        .extra-item input { accent-color:var(--primary); }
        .extra-price { margin-left:auto; color:var(--primary); font-size:0.85rem; }
        .modal-add-btn { width:100%; justify-content:center; margin-top:0.5rem; }

        .footer-cart { position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%); width:90%; max-width:480px; padding:1rem 1.2rem; border-radius:18px; box-shadow:0 10px 40px rgba(123,29,46,0.25); z-index:100; }
        .cart-summary { display:flex; justify-content:space-between; align-items:center; }
        .cart-text p { font-size:0.78rem; color:var(--text-muted); margin:0; }
        .cart-text strong { font-size:0.95rem; color:var(--text); }
        .pay-btn { display:flex; align-items:center; gap:0.5rem; min-width:140px; justify-content:center; }

        .spin { animation:spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
