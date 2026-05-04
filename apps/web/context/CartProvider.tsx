"use client";

import React, { useState, useEffect } from 'react';
import { CartContext, CartItem } from './CartContext';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Cargar carrito guardado (por si refrescan la página por error)
  useEffect(() => {
    const savedCart = localStorage.getItem('garum-cart');
    if (savedCart) {
      try { setItems(JSON.parse(savedCart)); } catch { localStorage.removeItem('garum-cart'); }
    }
  }, []);

  // Guardar cambios en el carrito
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
