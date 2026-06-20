import type { Order, PrinterConfig } from '../../shared/types';
import { printOrderTicket } from './ticket';
import { diag } from '../diag';

/**
 * Resultado de imprimir un pedido en una impresora concreta. `id` es el id de
 * config (PrinterConfig.id), clave de idempotencia por impresora (printed_targets).
 * `ok` incluye el caso "saltada por no tener items para ese destino" (que es un
 * éxito legítimo: esa impresora no tenía nada que sacar).
 */
export type PrintResult = { id: string; label: string; ok: boolean; reason?: string };

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
 * la vez). Devuelve el resultado POR impresora (ok/fallo + motivo) para que el
 * llamante registre cuáles imprimieron OK y reintente solo las que fallaron.
 */
export async function printOrder(
  order: Order,
  printers: PrinterConfig[],
): Promise<PrintResult[]> {
  if (printers.length === 0) return [];

  const settled = await Promise.allSettled(
    printers.map(printer =>
      enqueue(deviceKey(printer), () => printOrderTicket(order, printer)),
    ),
  );

  return settled.map((result, i) => {
    const p = printers[i];
    if (result.status === 'fulfilled') {
      return { id: p.id, label: p.label, ok: true };
    }
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.error(`[Printer] Error en "${p.label}":`, reason);
    diag(`[Printer] Error en "${p.label}":`, reason);
    return { id: p.id, label: p.label, ok: false, reason };
  });
}

export { printOrderTicket } from './ticket';
export { listWindowsPrinters, scanNetworkPrinters } from './discovery';
