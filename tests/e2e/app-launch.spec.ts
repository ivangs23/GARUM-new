import { test, expect } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';

let app: LaunchedApp;

test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

test('arranca la app y muestra el sidebar con título GARUM', async () => {
  const { window } = app;

  // El título de la BrowserWindow se fija en window.ts
  const title = await app.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getTitle() ?? '',
  );
  expect(title).toContain('Garum');

  // El sidebar debe renderizar el branding y la nav
  await expect(window.getByText('GARUM', { exact: true })).toBeVisible();
  await expect(window.getByText('Panel de Comandas')).toBeVisible();
  await expect(window.getByRole('button', { name: /Comandas/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /Configuración/ })).toBeVisible();
});

test('estado de conexión inicial es "Conectando..." (Realtime desactivado en E2E)', async () => {
  const { window } = app;
  // Sin Supabase activo, el estado nunca llega a "En línea"
  await expect(window.getByText('Conectando...')).toBeVisible();
});
