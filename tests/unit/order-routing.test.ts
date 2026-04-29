import { describe, it, expect } from 'vitest';
import {
  filterItems,
  hasItemsFor,
  effectiveDestination,
  normalize,
  BARRA_KEYWORDS,
} from '../../src/shared/order-routing';

describe('normalize', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(normalize('CafÉ con LECHE')).toBe('cafe con leche');
    expect(normalize('Cóctel de naranja')).toBe('coctel de naranja');
    expect(normalize('Caña')).toBe('cana');
    expect(normalize('Infusión de menta')).toBe('infusion de menta');
  });

  it('respeta strings ya normalizados', () => {
    expect(normalize('vino tinto')).toBe('vino tinto');
  });
});

describe('effectiveDestination — explícito gana', () => {
  it('respeta destination=cocina aunque el nombre sea de bebida', () => {
    expect(effectiveDestination({ name: 'Vino tinto', destination: 'cocina' })).toBe('cocina');
  });

  it('respeta destination=barra aunque el nombre sea de comida', () => {
    expect(effectiveDestination({ name: 'Croquetas', destination: 'barra' })).toBe('barra');
  });
});

describe('effectiveDestination — fallback por keywords', () => {
  it('manda a barra los items con keyword de bebida', () => {
    expect(effectiveDestination({ name: 'Vino Tempranillo' })).toBe('barra');
    expect(effectiveDestination({ name: 'Café espresso' })).toBe('barra');
    expect(effectiveDestination({ name: 'Cafe (sin tilde)' })).toBe('barra');
    expect(effectiveDestination({ name: 'Cóctel margarita' })).toBe('barra');
    expect(effectiveDestination({ name: 'Coctel margarita' })).toBe('barra');
    expect(effectiveDestination({ name: 'Caña doble' })).toBe('barra');
    expect(effectiveDestination({ name: 'Infusión digestiva' })).toBe('barra');
    expect(effectiveDestination({ name: 'Cava brut' })).toBe('barra');
    expect(effectiveDestination({ name: 'Champán' })).toBe('barra');
  });

  it('deja en cocina lo que no matchea', () => {
    expect(effectiveDestination({ name: 'Croquetas de jamón' })).toBe('cocina');
    expect(effectiveDestination({ name: 'Tabla de quesos' })).toBe('cocina');
    expect(effectiveDestination({ name: 'Tortilla' })).toBe('cocina');
  });

  it('destination null/undefined cae al fallback', () => {
    expect(effectiveDestination({ name: 'Vino', destination: null })).toBe('barra');
    expect(effectiveDestination({ name: 'Vino', destination: undefined })).toBe('barra');
  });

  it('destination con valor inválido cae al fallback', () => {
    // @ts-expect-error — probamos un valor fuera del tipo
    expect(effectiveDestination({ name: 'Vino', destination: 'patio' })).toBe('barra');
  });
});

describe('filterItems', () => {
  const items = [
    { name: 'Croquetas',     destination: 'cocina' as const },
    { name: 'Vino Rioja',    destination: 'barra'  as const },
    { name: 'Café',          /* legacy */ },
    { name: 'Tortilla',      /* legacy */ },
  ];

  it('cocina devuelve solo items de cocina', () => {
    const out = filterItems(items, 'cocina').map(i => i.name);
    expect(out).toEqual(['Croquetas', 'Tortilla']);
  });

  it('barra devuelve solo items de barra', () => {
    const out = filterItems(items, 'barra').map(i => i.name);
    expect(out).toEqual(['Vino Rioja', 'Café']);
  });
});

describe('hasItemsFor', () => {
  it('detecta cocina y barra a la vez', () => {
    const items = [
      { name: 'Croquetas', destination: 'cocina' as const },
      { name: 'Vino',      destination: 'barra'  as const },
    ];
    expect(hasItemsFor(items, 'cocina')).toBe(true);
    expect(hasItemsFor(items, 'barra')).toBe(true);
  });

  it('un pedido solo de barra no aparece en cocina', () => {
    const items = [{ name: 'Vino', destination: 'barra' as const }];
    expect(hasItemsFor(items, 'cocina')).toBe(false);
    expect(hasItemsFor(items, 'barra')).toBe(true);
  });

  it('lista vacía siempre falsa', () => {
    expect(hasItemsFor([], 'cocina')).toBe(false);
    expect(hasItemsFor([], 'barra')).toBe(false);
  });
});

describe('BARRA_KEYWORDS', () => {
  it('todos los keywords están normalizados (sin acentos, lowercase)', () => {
    for (const kw of BARRA_KEYWORDS) {
      expect(kw).toBe(normalize(kw));
    }
  });
});
