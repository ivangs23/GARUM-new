// CartContext — sin "use client" para que sea importable en Server Components
// El Provider con estado está en CartProvider.tsx ("use client")
import { createContext, useContext } from 'react';

export type CartItem = {
  id: string | number;
  name: string;
  price: number;
  quantity: number;
  destination?: 'cocina' | 'barra';
};

export type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string | number) => void;
  clearCart: () => void;
  totalQuantity: number;
  totalAmount: number;
};

export const CartContext = createContext<CartContextType | undefined>(undefined);

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
