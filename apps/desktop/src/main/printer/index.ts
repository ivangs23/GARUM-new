import type { Order, PrinterConfig } from '../../shared/types';
import { printOrderTicket } from './ticket';
import { diag } from '../diag';

export type PrintFailure = { label: string; reason: string };

/**
 * Envía el pedido a todas las impresoras configuradas que correspondan a su destino.
 * Cada impresora se intenta en paralelo. Devuelve las que fallaron (con motivo)
 * para que el llamante decida qué hacer: mostrar banner, no resetear printed_at
 * en éxito parcial, etc. Si printers está vacío, devuelve [] (no es error).
 */
export async function printOrder(
  order: Order,
  printers: PrinterConfig[],
): Promise<PrintFailure[]> {
  if (printers.length === 0) return [];

  const results = await Promise.allSettled(
    printers.map(printer => printOrderTicket(order, printer)),
  );

  const failures: PrintFailure[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[Printer] Error en "${printers[i].label}":`, reason);
      diag(`[Printer] Error en "${printers[i].label}":`, reason);
      failures.push({ label: printers[i].label, reason });
    }
  });
  return failures;
}

export { printOrderTicket } from './ticket';
export { listWindowsPrinters, scanNetworkPrinters } from './discovery';
