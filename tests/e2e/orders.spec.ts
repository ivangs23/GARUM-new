import { test, expect } from '@playwright/test';
import { launchApp, mockIpcHandle, pushFromMain, type LaunchedApp } from './helpers/launch';
import type { Order } from '../../src/shared/types';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

const sampleOrder: Order = {
  id: 'order-e2e-0001',
  table_number: 7,
  total_amount: 24.5,
  payment_status: 'paid',
  staff_status: 'pending',
  staff_status_kitchen: 'pending',
  staff_status_bar:     'pending',
  printed_at: null,
  created_at: new Date().toISOString(),
  items: [
    { id: 'i1', name: 'Croquetas',  price: 8.0, quantity: 2, destination: 'cocina' },
    { id: 'i2', name: 'Copa Vino',  price: 4.5, quantity: 1, destination: 'barra'  },
  ],
};

// Espera a que el renderer haya montado Orders y suscrito sus listeners IPC.
async function waitOrdersReady(window: typeof app.window) {
  await expect(window.getByText('Pedidos activos')).toBeVisible();
  // Las dos columnas vacías indican que useEffect ya corrió y onOrdersInit está suscrito.
  await expect(window.getByText('Sin pedidos pendientes')).toHaveCount(2);
}

test('un pedido entrante aparece en COCINA y BARRA según destino', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  // Empujamos un evento orders:init como lo haría Realtime al conectar
  await pushFromMain(electronApp, 'orders:init', [sampleOrder]);

  // El item de cocina aparece en la columna COCINA
  await expect(window.getByText('Croquetas')).toBeVisible();
  // El item de barra aparece en la columna BARRA
  await expect(window.getByText('Copa Vino')).toBeVisible();

  // El badge "MESA 7" se renderiza una vez por columna (cocina + barra)
  await expect(window.getByText('MESA 7')).toHaveCount(2);

  // Cabecera muestra "1 mesa pendiente"
  await expect(window.getByText('1 mesa pendiente')).toBeVisible();
});

test('un nuevo pedido por evento orders:new se añade a la lista', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  await pushFromMain(electronApp, 'orders:new', sampleOrder);

  await expect(window.getByText('Croquetas')).toBeVisible();
  await expect(window.getByText('Copa Vino')).toBeVisible();
});

test('marcar como LISTO en cocina solo cierra la card de cocina (per-destino)', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  // Stub: el renderer hace optimistic update; el handler real iría a Supabase.
  await mockIpcHandle(electronApp, 'orders:mark-done', undefined);

  await pushFromMain(electronApp, 'orders:init', [sampleOrder]);
  await expect(window.getByText('Croquetas')).toBeVisible();

  const cocinaColumn = window.locator('section', { hasText: 'COCINA' });
  const barraColumn  = window.locator('section', { hasText: 'BARRA' });

  await cocinaColumn.getByRole('button', { name: /LISTO/ }).click();

  // La card de cocina queda atenuada y sin botón
  await expect(cocinaColumn.locator('[data-done="true"]')).toBeVisible();
  await expect(cocinaColumn.getByRole('button', { name: /LISTO/ })).toHaveCount(0);

  // La card de barra sigue activa: sin data-done y mantiene su botón LISTO
  await expect(barraColumn.locator('[data-done="true"]')).toHaveCount(0);
  await expect(barraColumn.getByRole('button', { name: /LISTO/ })).toHaveCount(1);
});

test('un pedido eliminado por orders:removed desaparece de la vista', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  await pushFromMain(electronApp, 'orders:init', [sampleOrder]);
  await expect(window.getByText('Croquetas')).toBeVisible();

  await pushFromMain(electronApp, 'orders:removed', sampleOrder.id);

  await expect(window.getByText('Croquetas')).toHaveCount(0);
  await expect(window.getByText('Sin pedidos pendientes')).toHaveCount(2);
});
