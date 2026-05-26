import type { Order, PrinterConfig } from '../../shared/types';
import { printOrderTicket } from './ticket';
import { diag } from '../diag';

export type PrintFailure = { label: string; reason: string };

/**
 * Cola por dispositivo físico para evitar dos invocaciones concurrentes de
 * winspool/RAW contra el mismo printerName o socket TCP. Sin esto, en
 * Windows dos `WritePrinter` simultáneos para la misma cola provocan que
 * uno de los dos no llegue al cabezal (síntoma observado: 2 órdenes
 * dispararon reserva, solo salió 1 papel).
 *
 * El key cubre los dos adapters:
 *   - windows  → `win::${printerName}` (impresora local Windows)
 *   - escpos-tcp → `tcp::${host}:${port}` (red 9100)
 */
const printerQueues = new Map<string, Promise<unknown>>();

function deviceKey(p: PrinterConfig): string {
  if (p.adapter === 'windows') return `win::${p.printerName ?? p.label}`;
  return `tcp::${p.host ?? ''}:${p.port ?? 9100}`;
}

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = printerQueues.get(key) ?? Promise.resolve();
  const next = prev.then(task, task); // ejecuta task aunque el anterior haya rechazado
  // Encadenamos un .catch noop para que la promesa que guardamos no se quede
  // "unhandled rejection" cuando el siguiente la consume.
  printerQueues.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

/**
 * Envía el pedido a todas las impresoras configuradas. Cada destino físico
 * se serializa con `enqueue` para evitar la carrera de winspool, pero
 * dispositivos distintos siguen imprimiendo en paralelo (cocina y barra a
 * la vez). Devuelve las que fallaron (con motivo) para que el llamante
 * decida si liberar la reserva.
 */
export async function printOrder(
  order: Order,
  printers: PrinterConfig[],
): Promise<PrintFailure[]> {
  if (printers.length === 0) return [];

  const results = await Promise.allSettled(
    printers.map(printer =>
      enqueue(deviceKey(printer), () => printOrderTicket(order, printer)),
    ),
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
