/**
 * GARUM — routing de items a destino (cocina/barra).
 *
 * Fallback por keywords: si un item llega sin `destination` explícito
 * (datos huérfanos previos a la migración 010), inferimos por nombre.
 */

import type { Destination } from "./constants/destinations";
export type { Destination };

export type RoutableItem = {
  id?: string;
  name: string;
  quantity?: number;
  price?: number;
  destination?: Destination | null;
};

/**
 * Keywords BARRA: todo minúsculas + sin diacríticos. Usar `normalize()` antes de comparar.
 */
export const BARRA_KEYWORDS = [
  "vino",
  "cerveza",
  "cana", // "caña" sin diacrítico
  "cafe", // "café" sin diacrítico
  "copa",
  "coctel", // "cóctel" sin diacrítico
  "agua",
  "refresco",
  "infusion", // "infusión" sin diacrítico
  "champan", // "champán"
  "cava",
  "licor",
  "whisky",
  "whiskey",
  "gintonic",
  "gin",
  "ron",
  "vermut",
  "vermouth",
] as const;

/** Normaliza a minúsculas sin acentos para matching robusto. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Devuelve el destino "efectivo" de un item:
 *   - si trae `destination` explícito, ese.
 *   - si no, decide por keywords del nombre.
 */
export function effectiveDestination(item: RoutableItem): Destination {
  if (item.destination === "cocina" || item.destination === "barra") {
    return item.destination;
  }
  const n = normalize(item.name ?? "");
  return BARRA_KEYWORDS.some((kw) => n.includes(kw)) ? "barra" : "cocina";
}

/** Filtra los items de un pedido por destino. */
export function filterItems<T extends RoutableItem>(items: T[], dest: Destination): T[] {
  return items.filter((it) => effectiveDestination(it) === dest);
}

/** ¿El pedido tiene items para ese destino? */
export function hasItemsFor(items: RoutableItem[], dest: Destination): boolean {
  return items.some((it) => effectiveDestination(it) === dest);
}
