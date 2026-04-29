/**
 * GARUM — Lógica de routing de items a destino (cocina/barra).
 *
 * IMPORTANTE: este archivo se mantiene en SINCRONÍA con
 *   Garum/lib/order-routing.ts
 * Si lo cambias aquí, copia también allí. La fuente de verdad es el
 * fichero de la web (Garum/lib). Cualquier divergencia es un bug.
 */

export type Destination = 'cocina' | 'barra';

export type RoutableItem = {
  id?: string;
  name: string;
  quantity?: number;
  price?: number;
  destination?: Destination | null;
};

export const BARRA_KEYWORDS = [
  'vino',
  'cerveza',
  'cana',
  'cafe',
  'copa',
  'coctel',
  'agua',
  'refresco',
  'infusion',
  'champan',
  'cava',
  'licor',
  'whisky',
  'whiskey',
  'gintonic',
  'gin',
  'ron',
  'vermut',
  'vermouth',
] as const;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function effectiveDestination(item: RoutableItem): Destination {
  if (item.destination === 'cocina' || item.destination === 'barra') {
    return item.destination;
  }
  const n = normalize(item.name ?? '');
  return BARRA_KEYWORDS.some(kw => n.includes(kw)) ? 'barra' : 'cocina';
}

export function filterItems<T extends RoutableItem>(items: T[], dest: Destination): T[] {
  return items.filter(it => effectiveDestination(it) === dest);
}

export function hasItemsFor(items: RoutableItem[], dest: Destination): boolean {
  return items.some(it => effectiveDestination(it) === dest);
}
