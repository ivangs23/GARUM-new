"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type Category = {
  id?: string;
  name: string;
  slug: string;
  destination: 'cocina' | 'barra';
  icon: string;
  sort_order: number;
};

export default function CategoryForm({ initial }: { initial?: Category }) {
  const router = useRouter();
  const [form, setForm] = useState<Category>(initial ?? {
    name: '', slug: '', destination: 'cocina', icon: '', sort_order: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof Category, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  const autoSlug = (name: string) =>
    name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = { ...form };
    const { error } = initial?.id
      ? await supabase.from('categories').update(payload).eq('id', initial.id)
      : await supabase.from('categories').insert(payload);

    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/admin/categories');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="admin-form">
      <div className="form-row">
        <label>
          Nombre
          <input
            value={form.name}
            onChange={e => { set('name', e.target.value); if (!initial) set('slug', autoSlug(e.target.value)); }}
            required
          />
        </label>
        <label>
          Slug (URL)
          <input value={form.slug} onChange={e => set('slug', e.target.value)} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Destino
          <select value={form.destination} onChange={e => set('destination', e.target.value as 'cocina' | 'barra')}>
            <option value="cocina">Cocina</option>
            <option value="barra">Barra</option>
          </select>
        </label>
      </div>

      <div className="icon-selector-wrap">
        <p className="field-label">Icono de la categoría</p>
        <div className="icon-grid">
          {['🍷','🥂','🍺','🍹','☕','🥐','🥪','🥩','🐟','🥗','🍰','🧀','🍳','🥘','🍟','🍕','🍦','🍽️'].map(emoji => (
            <button
              key={emoji}
              type="button"
              className={`icon-choice ${form.icon === emoji ? 'selected' : ''}`}
              onClick={() => set('icon', emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>
          Orden de aparición
          <input type="number" value={form.sort_order} onChange={e => set('sort_order', +e.target.value)} />
        </label>
        <div style={{ flex: 2 }} />
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="form-actions">
        <button type="button" onClick={() => router.back()} className="btn-secondary">Cancelar</button>
        <button type="submit" className="gold-button" disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : (initial ? 'Guardar cambios' : 'Crear categoría')}
        </button>
      </div>

      <style jsx>{`
        .admin-form { display: flex; flex-direction: column; gap: 1.5rem; max-width: 700px; }
        .form-row { display: flex; gap: 1rem; flex-wrap: wrap; }
        .form-row label { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 160px; font-size: 0.85rem; color: var(--text-muted); }
        .form-row input, .form-row select {
          padding: 0.75rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .form-row input:focus, .form-row select:focus { border-color: var(--primary); }
        .icon-selector-wrap { display: flex; flex-direction: column; gap: 0.8rem; }
        .field-label { font-size: 0.85rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
        .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap: 0.6rem; background: #fff; padding: 1.2rem; border-radius: 16px; border: 1px solid var(--border); }
        .icon-choice {
          font-size: 1.8rem;
          padding: 0.6rem;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-choice:hover { border-color: var(--primary); background: var(--primary-light); transform: scale(1.1); }
        .icon-choice.selected { border-color: var(--primary); background: var(--primary-light); box-shadow: 0 0 0 3px rgba(123, 79, 150, 0.1); }
        
        .error-msg { color: #dc2626; font-size: 0.85rem; font-weight: 500; }
        .form-actions { display: flex; gap: 1rem; }
        .btn-secondary {
          padding: 0.75rem 1.5rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.2s;
        }
        .btn-secondary:hover { border-color: var(--text-muted); color: var(--text); }
        :global(.gold-button) { display: flex; align-items: center; gap: 0.5rem; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </form>
  );
}
