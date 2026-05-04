import { test, expect } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

test('navega entre Comandas y Configuración', async () => {
  const { window } = app;

  // Vista inicial: Comandas
  await expect(window.getByText('Pedidos activos')).toBeVisible();
  await expect(window.getByRole('heading', { name: 'COCINA' })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'BARRA'  })).toBeVisible();

  // Cambiar a Configuración
  await window.getByRole('button', { name: /Configuración/ }).click();
  await expect(window.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  await expect(window.getByRole('button', { name: '+ Nueva impresora' })).toBeVisible();

  // Volver a Comandas
  await window.getByRole('button', { name: /Comandas/ }).click();
  await expect(window.getByText('Pedidos activos')).toBeVisible();
});

test('sin pedidos muestra los placeholders en ambas columnas', async () => {
  const { window } = app;
  const empties = window.getByText('Sin pedidos pendientes');
  await expect(empties).toHaveCount(2);
});

test('navega a la pestaña Historial desde el sidebar', async () => {
  const { window } = app;

  await window.getByRole('button', { name: /Historial/ }).click();
  await expect(window.getByRole('heading', { name: 'Historial' })).toBeVisible();
});
