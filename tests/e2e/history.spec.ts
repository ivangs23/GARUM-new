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
