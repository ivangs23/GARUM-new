/**
 * Tests del comportamiento per-destino. Estos cubren el bug crítico #3
 * de la auditoría: antes de la migración 007, marcar LISTO en cocina
 * cerraba también la barra. Ahora cada destino se marca por separado.
 *
 * Validan, sin tocar Supabase real:
 *   - cocina LISTO no afecta a barra (y viceversa)
 *   - cocina LISTO + barra LISTO ⇒ ambas atenuadas
 *   - sub-status NA hace que la columna correspondiente no muestre el pedido
 *   - el estado optimista respeta el sub-status que llegue por Realtime echo
 */

import { test, expect } from '@playwright/test';
import { launchApp, mockIpcHandle, pushFromMain, type LaunchedApp } from './helpers/launch';
import type { Order } from '../../src/shared/types';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

const baseOrder = (): Order => ({
  id: 'pd-01',
  table_number: 12,
  total_amount: 30,
  payment_status: 'paid',
  staff_status: 'pending',
  staff_status_kitchen: 'pending',
  staff_status_bar:     'pending',
  printed_at: null,
  created_at: new Date().toISOString(),
  items: [
    { id: 'k1', name: 'Croquetas',  price: 8,  quantity: 2, destination: 'cocina' },
    { id: 'b1', name: 'Vino tinto', price: 14, quantity: 1, destination: 'barra'  },
  ],
});

async function waitOrdersReady(window: typeof app.window) {
  await expect(window.getByText('Pedidos activos')).toBeVisible();
  await expect(window.getByText('Sin pedidos pendientes')).toHaveCount(2);
}

test('cocina LISTO no atenúa la card de barra', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);
  await mockIpcHandle(electronApp, 'orders:mark-done', undefined);
  await pushFromMain(electronApp, 'orders:init', [baseOrder()]);

  const cocinaCol = window.locator('section', { hasText: 'COCINA' });
  const barraCol  = window.locator('section', { hasText: 'BARRA' });

  await cocinaCol.getByRole('button', { name: /LISTO/ }).click();

  await expect(cocinaCol.locator('[data-done="true"]')).toBeVisible();
  await expect(barraCol.locator('[data-done="true"]')).toHaveCount(0);
  await expect(barraCol.getByRole('button', { name: /LISTO/ })).toHaveCount(1);
});

test('barra LISTO no atenúa la card de cocina', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);
  await mockIpcHandle(electronApp, 'orders:mark-done', undefined);
  await pushFromMain(electronApp, 'orders:init', [baseOrder()]);

  const cocinaCol = window.locator('section', { hasText: 'COCINA' });
  const barraCol  = window.locator('section', { hasText: 'BARRA' });

  await barraCol.getByRole('button', { name: /LISTO/ }).click();

  await expect(barraCol.locator('[data-done="true"]')).toBeVisible();
  await expect(cocinaCol.locator('[data-done="true"]')).toHaveCount(0);
  await expect(cocinaCol.getByRole('button', { name: /LISTO/ })).toHaveCount(1);
});

test('cocina + barra LISTO atenúa ambas cards', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);
  await mockIpcHandle(electronApp, 'orders:mark-done', undefined);
  await pushFromMain(electronApp, 'orders:init', [baseOrder()]);

  const cocinaCol = window.locator('section', { hasText: 'COCINA' });
  const barraCol  = window.locator('section', { hasText: 'BARRA' });

  await cocinaCol.getByRole('button', { name: /LISTO/ }).click();
  await barraCol.getByRole('button', { name: /LISTO/ }).click();

  await expect(cocinaCol.locator('[data-done="true"]')).toBeVisible();
  await expect(barraCol.locator('[data-done="true"]')).toBeVisible();
});

test('un pedido solo cocina (bar NA) no aparece en la columna BARRA', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  const onlyKitchen: Order = {
    ...baseOrder(),
    id: 'pd-only-k',
    table_number: 21,
    staff_status_bar: 'na',
    items: [{ id: 'k1', name: 'Solomillo', price: 18, quantity: 1, destination: 'cocina' }],
  };
  await pushFromMain(electronApp, 'orders:init', [onlyKitchen]);

  const cocinaCol = window.locator('section', { hasText: 'COCINA' });
  const barraCol  = window.locator('section', { hasText: 'BARRA' });

  await expect(cocinaCol.getByText('Solomillo')).toBeVisible();
  await expect(barraCol.getByText('MESA 21')).toHaveCount(0);
  await expect(barraCol.getByText('Sin pedidos pendientes')).toBeVisible();
});

test('un pedido solo barra (kitchen NA) no aparece en la columna COCINA', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  const onlyBar: Order = {
    ...baseOrder(),
    id: 'pd-only-b',
    table_number: 22,
    staff_status_kitchen: 'na',
    items: [{ id: 'b1', name: 'Manzanilla', price: 4, quantity: 2, destination: 'barra' }],
  };
  await pushFromMain(electronApp, 'orders:init', [onlyBar]);

  const cocinaCol = window.locator('section', { hasText: 'COCINA' });
  const barraCol  = window.locator('section', { hasText: 'BARRA' });

  await expect(barraCol.getByText('Manzanilla')).toBeVisible();
  await expect(cocinaCol.getByText('MESA 22')).toHaveCount(0);
  await expect(cocinaCol.getByText('Sin pedidos pendientes')).toBeVisible();
});

test('Realtime echo con sub-status done atenúa la columna correspondiente', async () => {
  // Simula el flujo real: optimistic update, después Supabase devuelve
  // por postgres_changes el pedido con staff_status_kitchen='done'.
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  await pushFromMain(electronApp, 'orders:init', [baseOrder()]);
  const cocinaCol = window.locator('section', { hasText: 'COCINA' });
  const barraCol  = window.locator('section', { hasText: 'BARRA' });

  // Echo desde "main" tras el UPDATE: cocina done, barra sigue pending
  const echoed: Order = { ...baseOrder(), staff_status_kitchen: 'done', staff_status: 'pending' };
  await pushFromMain(electronApp, 'orders:new', echoed);

  await expect(cocinaCol.locator('[data-done="true"]')).toBeVisible();
  await expect(barraCol.locator('[data-done="true"]')).toHaveCount(0);
  await expect(barraCol.getByRole('button', { name: /LISTO/ })).toHaveCount(1);
});
