"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function ToggleAvailableButton({
  id,
  available,
}: {
  id: string;
  available: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(available);
  const [loading, setLoading]       = useState(false);

  const handleToggle = async () => {
    const next = !optimistic;
    setOptimistic(next); // UI optimista — no espera a la red
    setLoading(true);
    try {
      const { error } = await supabaseBrowser
        .from('products')
        .update({ is_available: next })
        .eq('id', id);
      if (error) throw error;
      router.refresh();
    } catch {
      setOptimistic(!next); // revertir si falla
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      title={optimistic ? 'Marcar como no disponible' : 'Marcar como disponible'}
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           '0.45rem',
        background:    'none',
        border:        'none',
        cursor:        loading ? 'default' : 'pointer',
        padding:       0,
        opacity:       loading ? 0.6 : 1,
        transition:    'opacity 0.15s',
      }}
    >
      {/* Pill toggle */}
      <span style={{
        position:        'relative',
        display:         'inline-block',
        width:           36,
        height:          20,
        borderRadius:    10,
        background:      optimistic ? '#16a34a' : '#6b7280',
        transition:      'background 0.2s',
        flexShrink:      0,
      }}>
        <span style={{
          position:    'absolute',
          top:         3,
          left:        optimistic ? 19 : 3,
          width:       14,
          height:      14,
          borderRadius: '50%',
          background:  '#fff',
          boxShadow:   '0 1px 3px rgba(0,0,0,0.3)',
          transition:  'left 0.2s',
        }} />
      </span>
      <span style={{
        fontSize:    '0.8rem',
        fontWeight:  600,
        color:       optimistic ? '#16a34a' : '#6b7280',
        transition:  'color 0.2s',
        minWidth:    24,
      }}>
        {optimistic ? 'Sí' : 'No'}
      </span>
    </button>
  );
}
