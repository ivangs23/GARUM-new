import type { Order, PrinterConfig } from '../../shared/types';
import { printOrderTicket } from './ticket';

/**
 * Envía el pedido a todas las impresoras configuradas que correspondan a su destino.
 * Cada impresora se intenta en paralelo; los errores individuales se loguean sin
 * detener las demás.
 */
export async function printOrder(order: Order, printers: PrinterConfig[]): Promise<void> {
  if (printers.length === 0) return;

  const results = await Promise.allSettled(
    printers.map(printer => printOrderTicket(order, printer)),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[Printer] Error en "${printers[i].label}":`, result.reason);
    }
  });
}

export { printOrderTicket } from './ticket';
export { listWindowsPrinters, scanNetworkPrinters } from './discovery';
