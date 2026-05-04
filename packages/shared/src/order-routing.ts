/**
 * GARUM — Lógica de routing de items a destino (cocina/barra).
 *
 * IMPORTANTE: este archivo se mantiene en SINCRONÍA con
 *   garum-desktop/src/shared/order-routing.ts
 * Si lo cambias aquí, copia también allí. La fuente de verdad es
 * este archivo (web). Cualquier divergencia es un bug.
 *
 * Por qué existe el fallback: durante un tiempo el carrito guardó items
 * en `orders.items` sin el campo `destination`. La migración 010 los
 * rellena, pero por si quedaran datos huérfanos el fallback sigue
 * funcionando con un único set de keywords compartido por web y desktop.
 */

export type Destination = "cocina" | "barra";

export type RoutableItem = {
  id?: string;
  name: string;
  quantity?: number;
  price?: number;
  destination?: Destination | null;
};

/**
 * Keywords que mandan un item al destino BARRA cuando no tiene
 * `destination` explícito. Listado conservador y normalizado:
 * todo en minúsculas y sin diacríticos. Usar `normalize()` antes de
 * comparar. Si añades o quitas un keyword aquí, replícalo también en
 * el fichero del desktop.
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
