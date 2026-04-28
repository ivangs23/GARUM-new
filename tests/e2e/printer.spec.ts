import { test, expect } from '@playwright/test';
import { launchApp, mockIpcHandle, type LaunchedApp } from './helpers/launch';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

test('añadir impresora TCP, probar (mock OK) y guardar', async () => {
  const { app: electronApp, window } = app;

  // Mockeamos el IPC para que no intente conectarse a una impresora real
  await mockIpcHandle(electronApp, 'printers:test',  undefined);
  await mockIpcHandle(electronApp, 'config:save',    undefined);

  await window.getByRole('button', { name: /Configuración/ }).click();
  await expect(window.getByRole('heading', { name: 'Configuración' })).toBeVisible();

  // Añadir nueva impresora
  await window.getByRole('button', { name: '+ Nueva impresora' }).click();

  // Editar etiqueta + IP
  const labelInput = window.getByPlaceholder('Etiqueta (ej. Cocina, Barra)');
  await labelInput.fill('Cocina principal');

  const ipInput = window.getByPlaceholder('192.168.1.100');
  await ipInput.fill('10.0.0.42');

  // Probar — el mock resuelve OK → debe verse "✓ OK"
  await window.getByRole('button', { name: 'Probar' }).click();
  await expect(window.getByRole('button', { name: '✓ OK' })).toBeVisible();

  // Guardar — el mock resuelve OK → debe verse "✓ Guardado" momentáneamente
  await window.getByRole('button', { name: 'Guardar' }).click();
  await expect(window.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
});

test('botón Probar muestra "✗ Error" si el handler IPC falla', async () => {
  const { app: electronApp, window } = app;

  // Forzamos un error desde el main process
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('printers:test');
    ipcMain.handle('printers:test', async () => { throw new Error('ECONNREFUSED'); });
  });

  await window.getByRole('button', { name: /Configuración/ }).click();
  await window.getByRole('button', { name: '+ Nueva impresora' }).click();

  await window.getByRole('button', { name: 'Probar' }).click();
  await expect(window.getByRole('button', { name: '✗ Error' })).toBeVisible();
});

test('listar impresoras Windows (mock) muestra los resultados', async () => {
  const { app: electronApp, window } = app;

  await mockIpcHandle(electronApp, 'printers:list-windows', [
    { type: 'windows', name: 'EPSON TM-T20III' },
    { type: 'windows', name: 'Microsoft Print to PDF' },
  ]);

  await window.getByRole('button', { name: /Configuración/ }).click();
  await window.getByRole('button', { name: 'Listar impresoras Windows' }).click();

  await expect(window.getByText('🖨 EPSON TM-T20III')).toBeVisible();
  await expect(window.getByText('🖨 Microsoft Print to PDF')).toBeVisible();
});

test('eliminar una impresora la borra de la lista', async () => {
  const { window } = app;

  await window.getByRole('button', { name: /Configuración/ }).click();
  await window.getByRole('button', { name: '+ Nueva impresora' }).click();
  await expect(window.getByPlaceholder('Etiqueta (ej. Cocina, Barra)')).toBeVisible();

  await window.getByTitle('Eliminar impresora').click();
  await expect(window.getByPlaceholder('Etiqueta (ej. Cocina, Barra)')).toHaveCount(0);
  await expect(window.getByText('No hay impresoras configuradas todavía.')).toBeVisible();
});
