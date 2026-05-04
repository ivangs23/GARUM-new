import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import type { Order, OrderItem, PrinterConfig } from '../../shared/types';
import { filterItems, type Destination } from '@garum/shared/order-routing';

/**
 * Sanea texto para PC858_EURO. node-thermal-printer hace lo suyo, pero
 * caracteres como las comillas curvas (« » " "), el carácter de
 * elipsis (…) o los emojis salen como cajas. Pasamos NFKD y nos
 * quedamos con el rango ASCII + Latin-1 + euro.
 */
function sanitizeForThermal(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/€/g, '€') // euro: lo dejamos
    // eliminar emojis y otros símbolos fuera de Latin-1 + euro
    .replace(/[^\x20-\xff]/g, '?');
}

/**
 * Imprime el ticket de un pedido en la impresora indicada.
 * Filtra los ítems según el destino configurado en la impresora,
 * usando el helper compartido (mismo criterio que el panel staff web).
 */
export async function printOrderTicket(
  order: Order,
  printerConfig: PrinterConfig,
): Promise<void> {
  const dest = printerConfig.destination;

  // Filtrar ítems por destino. 'all' imprime todo. Para 'cocina' / 'barra'
  // delegamos al helper compartido para que el ruteo sea idéntico al de
  // la web (incluye fallback por keywords para items legacy sin
  // `destination`).
  let items: OrderItem[];
  if (dest === 'all') {
    items = order.items;
  } else {
    items = filterItems(order.items, dest as Destination);
  }

  if (items.length === 0) return; // nada que imprimir para este destino

  const iface = buildInterface(printerConfig);

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: iface,
    characterSet: CharacterSet.PC858_EURO,
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });

  const connected = await printer.isPrinterConnected();
  if (!connected) {
    throw new Error(`Impresora no accesible: ${printerConfig.label} (${iface})`);
  }

  const destLabel =
    dest === 'cocina' ? 'COCINA' : dest === 'barra' ? 'BARRA' : 'TODOS';
  const time = new Date(order.created_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // ── Cabecera ──────────────────────────────────────────────────────────────
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println('GARUM VINOTECA');
  printer.setTextNormal();
  printer.bold(false);
  printer.drawLine();

  // ── Destino + Mesa ────────────────────────────────────────────────────────
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(destLabel);
  printer.setTextNormal();

  printer.alignLeft();
  printer.bold(true);
  printer.println(`MESA ${order.table_number}`);
  printer.bold(false);
  printer.println(`Hora: ${time}`);
  printer.drawLine();

  // ── Líneas de producto ────────────────────────────────────────────────────
  for (const item of items) {
    printer.alignLeft();
    printer.setTextSize(1, 1);
    printer.println(`${item.quantity}x  ${sanitizeForThermal(item.name)}`);
    printer.setTextNormal();
  }

  printer.drawLine();

  // ── Pie ───────────────────────────────────────────────────────────────────
  printer.alignCenter();
  printer.println(`Pedido #${order.id.slice(-6).toUpperCase()}`);
  printer.newLine();
  printer.cut();

  await printer.execute();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInterface(config: PrinterConfig): string {
  switch (config.adapter) {
    case 'escpos-tcp':
      return `tcp://${config.host ?? '127.0.0.1'}:${config.port ?? 9100}`;
    case 'windows':
      return `printer:${config.printerName ?? ''}`;
    default:
      return `tcp://${config.host ?? '127.0.0.1'}:${config.port ?? 9100}`;
  }
}
