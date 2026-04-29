import { test, expect } from '@playwright/test';
import { launchApp, pushFromMain, type LaunchedApp } from './helpers/launch';
import type { Order } from '../../src/shared/types';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

const pendingOrder: Order = {
  id: 'pend-1', table_number: 5, total_amount: 10, payment_status: 'paid',
  staff_status: 'pending',
  staff_status_kitchen: 'pending', staff_status_bar: 'na',
  printed_at: null,
  created_at: new Date().toISOString(),
  items: [{ id: 'i1', name: 'Calamares', price: 10, quantity: 1, destination: 'cocina' }],
};
const doneOrder: Order = {
  id: 'done-1', table_number: 9, total_amount: 5, payment_status: 'paid',
  staff_status: 'done',
  staff_status_kitchen: 'done', staff_status_bar: 'na',
  printed_at: new Date(Date.now() - 60_000).toISOString(),
  created_at: new Date(Date.now() - 60_000).toISOString(),
  items: [{ id: 'i1', name: 'Tortilla', price: 5, quantity: 1, destination: 'cocina' }],
};

test('un pedido done aparece atenuado y sin botón LISTO', async () => {
  const { app: electronApp, window } = app;
  await expect(window.getByText('Pedidos activos')).toBeVisible();

  await pushFromMain(electronApp, 'orders:init', [pendingOrder, doneOrder]);

  // Pendiente: tarjeta con botón LISTO
  await expect(window.getByText('Calamares')).toBeVisible();
  await expect(window.getByRole('button', { name: /✓ LISTO/ })).toBeVisible();

  // Done: visible, mesa visible, pero su tarjeta NO tiene botón LISTO
  await expect(window.getByText('Tortilla')).toBeVisible();
  // Solo hay UN botón LISTO en cocina (el del pendiente)
  const listoButtons = window.getByRole('button', { name: /✓ LISTO/ });
  await expect(listoButtons).toHaveCount(1);

  // La tarjeta done lleva data-done="true" (selector que añadiremos para que el test sea estable)
  await expect(window.locator('[data-done="true"]').first()).toBeVisible();
});
