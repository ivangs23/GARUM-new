import { test, expect } from '@playwright/test';
import { launchApp, mockIpcHandle, type LaunchedApp } from './helpers/launch';
import type { Order } from '../../src/shared/types';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

const historyOrder: Order = {
  id: 'hist-001',
  table_number: 3,
  total_amount: 18.5,
  payment_status: 'paid',
  staff_status: 'done',
  created_at: '2026-04-27T20:00:00.000Z',
  items: [{ id: 'i1', name: 'Croquetas', price: 8.0, quantity: 2, destination: 'cocina' }],
};

test('window.api.listHistory invoca el handler IPC y recibe pedidos', async () => {
  const { app: electronApp, window } = app;

  await mockIpcHandle(electronApp, 'history:list', [historyOrder]);

  const result = await window.evaluate(async () =>
    (window as any).api.listHistory(50, 0),
  );

  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('hist-001');
});

test('la página Historial muestra pedidos agrupados por fecha', async () => {
  const { app: electronApp, window } = app;

  // Mock con 2 pedidos en 2 días distintos
  const yesterday: Order = {
    id: 'h-yest', table_number: 4, total_amount: 12, payment_status: 'paid',
    staff_status: 'done',
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    items: [{ id: 'i1', name: 'Patatas', price: 6, quantity: 2, destination: 'cocina' }],
  };
  const twoDaysAgo: Order = {
    id: 'h-2d', table_number: 7, total_amount: 8, payment_status: 'paid',
    staff_status: 'done',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    items: [{ id: 'i1', name: 'Pulpo', price: 8, quantity: 1, destination: 'cocina' }],
  };
  await mockIpcHandle(electronApp, 'history:list', [yesterday, twoDaysAgo]);

  await window.getByRole('button', { name: /Historial/ }).click();

  // Cabecera "Ayer" y los items aparecen
  await expect(window.getByText('Ayer')).toBeVisible();
  await expect(window.getByText('Patatas')).toBeVisible();
  await expect(window.getByText('Pulpo')).toBeVisible();

  // Cabecera mesa visible para ambos pedidos
  await expect(window.getByText('Mesa 4')).toBeVisible();
  await expect(window.getByText('Mesa 7')).toBeVisible();
});
