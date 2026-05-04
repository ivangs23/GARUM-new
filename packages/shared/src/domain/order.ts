import type { Database } from "../database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];

/**
 * Shape of a single item stored in the JSONB `orders.items` column.
 * Fields come from the checkout route (apps/web/app/api/checkout/route.ts)
 * and are consumed by the desktop renderer.
 */
export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  destination?: "cocina" | "barra" | null;
}

/**
 * Typed order with strongly-typed `items` (overrides the raw `Json` type
 * from the database schema), `total_amount` as non-nullable (the desktop
 * calls `.toFixed(2)` on it), and without the Stripe-only field
 * `stripe_session_id` which is not read by the desktop.
 */
export interface Order extends Omit<OrderRow, "items" | "total_amount" | "stripe_session_id"> {
  items: OrderItem[];
  total_amount: number;
}
