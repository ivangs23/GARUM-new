import { ipcMain, BrowserWindow } from 'electron';
import {
  getOrders,
  markOrderDone,
  getSupabase,
  getConnectionStatus,
  getMaintenance,
  reconnect,
} from './realtime';
import { loadConfig, saveConfig } from './config';
import { printOrderTicket, listWindowsPrinters, scanNetworkPrinters } from './printer';
import { listHistory } from './history';
import {
  IPC,
  type AppConfig,
  type PrinterConfig,
  type Order,
} from '../shared/types';

export function setupIpc(win: BrowserWindow): void {

  // ── Pedidos ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.ORDERS_GET, () => getOrders());

  ipcMain.handle(
    IPC.ORDERS_MARK_DONE,
    async (
      _e,
      payload: string | { id: string; destination: 'cocina' | 'barra' },
    ): Promise<void> => {
      // Compatibilidad: el renderer antiguo enviaba solo el id; el nuevo envía
      // {id, destination} para marcar listo solo el destino correspondiente.
      if (typeof payload === 'string') {
        // Sin destino: marca ambos. Si uno falla (ej. no había pending en ese
        // destino) seguimos con el otro; pero si ambos fallan propagamos error
        // para que el renderer pueda hacer rollback.
        const results = await Promise.allSettled([
          markOrderDone(payload, 'cocina'),
          markOrderDone(payload, 'barra'),
        ]);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length === results.length) {
          const first = failures[0] as PromiseRejectedResult;
          throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
        }
      } else {
        await markOrderDone(payload.id, payload.destination);
      }
    },
  );

  // ── Configuración ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CONFIG_GET, () => loadConfig());

  ipcMain.handle(IPC.CONFIG_SAVE, async (_e, config: AppConfig) => {
    saveConfig(config);
  });

  ipcMain.handle(IPC.CONFIG_RECONNECT, async () => {
    await reconnect(win);
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
      table_number: 99,
      items: [{ id: 'test', name: 'Ticket de prueba', price: 0, quantity: 1 }],
      total_amount: 0,
      payment_status: 'paid',
      staff_status: 'pending',
      staff_status_kitchen: 'pending',
      staff_status_bar: 'pending',
      printed_at: null,
      created_at: new Date().toISOString(),
    };
    await printOrderTicket(testOrder, printerConfig);
  });

  // ── Historial ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_LIST, async (_e, args: { limit: number; offset: number }) => {
    return listHistory(getSupabase(), args.limit, args.offset);
  });

  // ── Conexión ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CONNECTION_GET, () => getConnectionStatus());

  // ── Mantenimiento ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.MAINTENANCE_GET, () => getMaintenance());
}
