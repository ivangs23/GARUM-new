"use client";

import React, { useState, useEffect } from 'react';
import { CartContext, CartItem } from './CartContext';

function readPersistedCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('garum-cart');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    localStorage.removeItem('garum-cart');
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: leer una sola vez en el primer render del cliente, sin
  // ejecutarlo en SSR. Evita un useEffect → setState al montar que dispara
  // un re-render extra y rompe la regla react-hooks/set-state-in-effect.
  const [items, setItems] = useState<CartItem[]>(readPersistedCart);

  // Sincronizar al storage cuando cambia el carrito. Este effect SÍ es
  // correcto: actualiza un sistema externo (localStorage) en respuesta a
  // estado React, no llama setState.
  useEffect(() => {
    localStorage.setItem('garum-cart', JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: Omit<CartItem, 'quantity'>) => {
    setItems(prevItems => {
      const existing = prevItems.find(i => i.id === newItem.id);
      if (existing) {
        return prevItems.map(i =>
          i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prevItems, { ...newItem, quantity: 1 }];
    });
  };

  const removeItem = (id: string | number) => {
    setItems(prevItems => {
      const existing = prevItems.find(i => i.id === id);
      if (existing?.quantity === 1) {
        return prevItems.filter(i => i.id !== id);
      }
      return prevItems.map(i =>
        i.id === id ? { ...i, quantity: i.quantity - 1 } : i
      );
    });
  };

  const clearCart = () => setItems([]);

  const totalQuantity = items.reduce((acc, i) => acc + i.quantity, 0);
  const totalAmount   = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, totalQuantity, totalAmount }}>
      {children}
    </CartContext.Provider>
  );
}
