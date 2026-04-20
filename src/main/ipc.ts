import { ipcMain, BrowserWindow } from 'electron';
import { getOrders, markOrderDone } from './realtime';
import { loadConfig, saveConfig } from './config';
import { printOrderTicket, listWindowsPrinters, scanNetworkPrinters } from './printer';
import { IPC, type AppConfig, type PrinterConfig, type Order } from '../shared/types';

export function setupIpc(win: BrowserWindow): void {

  // ── Pedidos ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.ORDERS_GET, () => getOrders());

  ipcMain.handle(IPC.ORDERS_MARK_DONE, async (_e, id: string) => {
    await markOrderDone(id);
  });

  // ── Configuración ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CONFIG_GET, () => loadConfig());

  ipcMain.handle(IPC.CONFIG_SAVE, async (_e, config: AppConfig) => {
    saveConfig(config);
  });

  // ── Impresoras ────────────────────────────────────────────────────────────

  // Listar impresoras instaladas en Windows (PowerShell)
  ipcMain.handle(IPC.PRINTERS_LIST_WINDOWS, () => listWindowsPrinters());

  // Escanear red local en busca de impresoras ESC/POS (puerto 9100)
  ipcMain.handle(IPC.PRINTERS_SCAN_NETWORK, () => {
    const { scanSubnet } = loadConfig();
    return scanNetworkPrinters(scanSubnet || undefined);
  });

  // Imprimir ticket de prueba en una impresora concreta
  ipcMain.handle(IPC.PRINTERS_TEST, async (_e, printerConfig: PrinterConfig) => {
    const testOrder: Order = {
      id: 'test-00000000',
      table_number: 0,
      items: [{ id: 'test', name: 'Ticket de prueba OK', price: 0, quantity: 1 }],
      total_amount: 0,
      payment_status: 'paid',
      staff_status: 'pending',
      created_at: new Date().toISOString(),
    };
    await printOrderTicket(testOrder, printerConfig);
  });
}
