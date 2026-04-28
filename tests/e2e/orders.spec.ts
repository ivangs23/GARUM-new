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

test('marcar como LISTO retira la card del pedido', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  // Stub del handler real (no hay Supabase activo, devolvemos void)
  await mockIpcHandle(electronApp, 'orders:mark-done', undefined);

  await pushFromMain(electronApp, 'orders:init', [sampleOrder]);
  await expect(window.getByText('Croquetas')).toBeVisible();

  // Hay un botón LISTO por columna donde aparece la mesa.
  // Pulsamos el primero (columna COCINA) y verificamos que esa card desaparece.
  const cocinaColumn = window.locator('section', { hasText: 'COCINA' });
  await cocinaColumn.getByRole('button', { name: /LISTO/ }).click();

  // El item de cocina ya no debe estar visible
  await expect(cocinaColumn.getByText('Croquetas')).toHaveCount(0);
});

test('un pedido con staff_status=done desaparece (orders:removed)', async () => {
  const { app: electronApp, window } = app;
  await waitOrdersReady(window);

  await pushFromMain(electronApp, 'orders:init', [sampleOrder]);
  await expect(window.getByText('Croquetas')).toBeVisible();

  await pushFromMain(electronApp, 'orders:removed', sampleOrder.id);

  await expect(window.getByText('Croquetas')).toHaveCount(0);
  await expect(window.getByText('Sin pedidos pendientes')).toHaveCount(2);
});
