import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import type { Order, PrinterConfig } from '../../shared/types';

/**
 * Imprime el ticket de un pedido en la impresora indicada.
 * Filtra los ítems según el destino configurado en la impresora.
 */
export async function printOrderTicket(
  order: Order,
  printerConfig: PrinterConfig,
): Promise<void> {
  const dest = printerConfig.destination;

  // Filtrar ítems por destino
  const items =
    dest === 'all'
      ? order.items
      : order.items.filter(i => !i.destination || i.destination === dest);

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
    printer.println(`${item.quantity}x  ${item.name}`);
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
