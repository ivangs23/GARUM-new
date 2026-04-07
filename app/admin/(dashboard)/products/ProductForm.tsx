"use client";

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X, Upload } from 'lucide-react';
import Image from 'next/image';

const ALLERGENS = [
  { id: 1, name: 'Gluten', icon: '🌾' }, { id: 2, name: 'Crustáceos', icon: '🦞' },
  { id: 3, name: 'Huevos', icon: '🥚' }, { id: 4, name: 'Pescado', icon: '🐟' },
  { id: 5, name: 'Cacahuetes', icon: '🥜' }, { id: 6, name: 'Soja', icon: '🌱' },
  { id: 7, name: 'Lácteos', icon: '🥛' }, { id: 8, name: 'Frutos de cáscara', icon: '🌰' },
  { id: 9, name: 'Apio', icon: '🌿' }, { id: 10, name: 'Mostaza', icon: '🟡' },
  { id: 11, name: 'Sésamo', icon: '🌰' }, { id: 12, name: 'Dióxido de azufre', icon: '💨' },
  { id: 13, name: 'Altramuces', icon: '🌻' }, { id: 14, name: 'Moluscos', icon: '🐚' },
];

type Extra = { id?: string; name: string; price: number };
type ProductData = {
  id?: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  allergen_ids: number[];
  is_available: boolean;
  sort_order: number;
};

type Props = {
  initial?: ProductData & { product_extras?: Extra[] };
  categories: { id: string; name: string }[];
};

export default function ProductForm({ initial, categories }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProductData>(initial ?? {
    category_id: categories[0]?.id ?? '',
    name: '', description: '', price: 0,
    image_url: '', allergen_ids: [],
    is_available: true, sort_order: 0,
  });
  const [extras, setExtras] = useState<Extra[]>(initial?.product_extras ?? []);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof ProductData, v: string | number | boolean | number[]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleAllergen = (id: number) =>
    set('allergen_ids', form.allergen_ids.includes(id)
      ? form.allergen_ids.filter(a => a !== id)
      : [...form.allergen_ids, id]
    );

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}.${ext}`;
    const { error, data } = await supabase.storage.from('products').upload(path, file, { upsert: true });
    if (error) { setError('Error subiendo imagen'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(data.path);
    set('image_url', publicUrl);
    setUploading(false);
  };

  const addExtra = () => setExtras(e => [...e, { name: '', price: 0 }]);
  const removeExtra = (i: number) => setExtras(e => e.filter((_, idx) => idx !== i));
  const setExtra = (i: number, k: keyof Extra, v: string | number) =>
    setExtras(e => e.map((ex, idx) => idx === i ? { ...ex, [k]: v } : ex));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let productId = initial?.id;

    if (productId) {
      const { error } = await supabase.from('products').update(form).eq('id', productId);
      if (error) { setError(error.message); setLoading(false); return; }
    } else {
      const { data, error } = await supabase.from('products').insert(form).select('id').single();
      if (error) { setError(error.message); setLoading(false); return; }
      productId = data.id;
    }

    // Sync extras
    await supabase.from('product_extras').delete().eq('product_id', productId);
    if (extras.length > 0) {
      await supabase.from('product_extras').insert(
        extras.filter(ex => ex.name).map(ex => ({ product_id: productId, name: ex.name, price: ex.price }))
      );
    }

    router.push('/admin/products');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="admin-form">

      {/* Imagen */}
      <div className="image-section">
        <div className="image-preview" onClick={() => fileRef.current?.click()}>
          {form.image_url ? (
            <Image src={form.image_url} alt="preview" fill style={{ objectFit: 'cover' }} />
          ) : (
            <div className="image-placeholder">
              {uploading ? <Loader2 size={24} className="spin" /> : <Upload size={24} />}
              <span>{uploading ? 'Subiendo...' : 'Subir foto'}</span>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
        {form.image_url && (
          <button type="button" className="remove-img" onClick={() => set('image_url', '')}>
            <X size={14} /> Quitar imagen
          </button>
        )}
      </div>

      {/* Datos básicos */}
      <div className="form-row">
        <label>
          Categoría
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)} required>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Precio (€)
          <input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', +e.target.value)} required />
        </label>
        <label>
          Orden
          <input type="number" value={form.sort_order} onChange={e => set('sort_order', +e.target.value)} />
        </label>
      </div>

      <label className="full-label">
        Nombre
        <input value={form.name} onChange={e => set('name', e.target.value)} required />
      </label>

      <label className="full-label">
        Descripción
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
      </label>

      <label className="toggle-label">
        <span>Disponible</span>
        <input type="checkbox" checked={form.is_available} onChange={e => set('is_available', e.target.checked)} />
      </label>

      {/* Alérgenos */}
      <div className="section-block">
        <h3 className="section-label">Alérgenos</h3>
        <div className="allergens-grid">
          {ALLERGENS.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleAllergen(a.id)}
              className={`allergen-btn ${form.allergen_ids.includes(a.id) ? 'active' : ''}`}
            >
              {a.icon} {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Extras */}
      <div className="section-block">
        <div className="section-header">
          <h3 className="section-label">Extras</h3>
          <button type="button" onClick={addExtra} className="add-extra-btn">
            <Plus size={14} /> Añadir extra
          </button>
        </div>
        <div className="extras-list">
          {extras.map((ex, i) => (
            <div key={i} className="extra-row">
              <input placeholder="Nombre del extra" value={ex.name} onChange={e => setExtra(i, 'name', e.target.value)} />
              <input type="number" step="0.01" min="0" placeholder="Precio" value={ex.price} onChange={e => setExtra(i, 'price', +e.target.value)} style={{ width: '100px' }} />
              <button type="button" onClick={() => removeExtra(i)} className="remove-btn"><X size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="form-actions">
        <button type="button" onClick={() => router.back()} className="btn-secondary">Cancelar</button>
        <button type="submit" className="gold-button" disabled={loading || uploading}>
          {loading ? <Loader2 size={16} className="spin" /> : (initial ? 'Guardar cambios' : 'Crear producto')}
        </button>
      </div>

      <style jsx>{`
        .admin-form { display: flex; flex-direction: column; gap: 1.5rem; max-width: 760px; }
        .image-section { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
        .image-preview {
          position: relative; width: 160px; height: 120px;
          border-radius: 12px; border: 2px dashed var(--border);
          background: var(--surface); cursor: pointer; overflow: hidden;
          transition: border-color 0.2s;
        }
        .image-preview:hover { border-color: var(--primary); }
        .image-placeholder {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 100%; gap: 0.4rem; color: var(--text-muted); font-size: 0.8rem;
        }
        .remove-img {
          display: flex; align-items: center; gap: 0.3rem;
          background: none; border: none; color: #f87171; font-size: 0.8rem; cursor: pointer;
        }
        .form-row { display: flex; gap: 1rem; flex-wrap: wrap; }
        .form-row label, .full-label {
          display: flex; flex-direction: column; gap: 0.4rem;
          flex: 1; min-width: 160px; font-size: 0.85rem; color: var(--text-muted);
        }
        .full-label { min-width: 100%; }
        .form-row input, .form-row select, .full-label input, .full-label textarea,
        .extra-row input {
          padding: 0.75rem 1rem;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 10px; color: var(--text); font-size: 0.95rem;
          outline: none; transition: border-color 0.2s; font-family: inherit;
        }
        .form-row input:focus, .form-row select:focus, .full-label input:focus,
        .full-label textarea:focus, .extra-row input:focus { border-color: var(--primary); }
        .full-label textarea { resize: vertical; }
        .toggle-label {
          display: flex; align-items: center; gap: 1rem;
          font-size: 0.95rem; color: var(--text-muted); cursor: pointer;
        }
        .toggle-label input { width: 18px; height: 18px; accent-color: var(--primary); }
        .section-block { display: flex; flex-direction: column; gap: 0.75rem; }
        .section-label { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
        .section-header { display: flex; align-items: center; justify-content: space-between; }
        .allergens-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .allergen-btn {
          padding: 0.35rem 0.8rem; border-radius: 20px; border: 1px solid var(--border);
          background: var(--surface); color: var(--text-muted); font-size: 0.8rem;
          cursor: pointer; transition: all 0.2s;
        }
        .allergen-btn.active { border-color: var(--primary); color: var(--primary); background: rgba(212,175,55,0.1); }
        .add-extra-btn {
          display: flex; align-items: center; gap: 0.3rem;
          background: none; border: 1px solid var(--border); border-radius: 8px;
          color: var(--text-muted); font-size: 0.8rem; padding: 0.4rem 0.8rem; cursor: pointer;
          transition: all 0.2s;
        }
        .add-extra-btn:hover { border-color: var(--primary); color: var(--primary); }
        .extras-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .extra-row { display: flex; gap: 0.5rem; align-items: center; }
        .extra-row input:first-child { flex: 1; }
        .remove-btn {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: none; border: 1px solid var(--border); color: #f87171; cursor: pointer;
        }
        .error-msg { color: #f87171; font-size: 0.85rem; }
        .form-actions { display: flex; gap: 1rem; }
        .btn-secondary {
          padding: 0.75rem 1.5rem; background: var(--surface);
          border: 1px solid var(--border); border-radius: 10px;
          color: var(--text-muted); cursor: pointer; font-size: 0.95rem; transition: all 0.2s;
        }
        .btn-secondary:hover { border-color: var(--text-muted); color: var(--text); }
        :global(.gold-button) { display: flex; align-items: center; gap: 0.5rem; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </form>
  );
}
