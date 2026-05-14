import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";
import type { Order, PrinterConfig } from "../../shared/types";
import { buildTicketLines, type TicketDestination, type TicketLine } from "@garum/shared/ticket";

export async function printOrderTicket(
  order: Order,
  printerConfig: PrinterConfig,
): Promise<void> {
  const destination = printerConfig.destination as TicketDestination;
  const lines = buildTicketLines(order, destination);

  // Mantener comportamiento legacy: si tras filtrar no hay items reales,
  // no imprimir nada (solo el preview muestra el placeholder informativo).
  const hasItemLines = lines.some(
    (l) => l.kind === "text" && /^\d+x  /.test(l.text),
  );
  if (!hasItemLines) return;

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

  for (const line of lines) {
    emitLine(printer, line);
  }

  await printer.execute();
}

function emitLine(printer: ThermalPrinter, line: TicketLine): void {
  switch (line.kind) {
    case "text": {
      if (line.align === "center") printer.alignCenter();
      else if (line.align === "right") printer.alignRight();
      else printer.alignLeft();
      printer.bold(line.bold ?? false);
      if (line.size === 2) printer.setTextSize(1, 1);
      else printer.setTextNormal();
      printer.println(line.text);
      printer.bold(false);
      printer.setTextNormal();
      return;
    }
    case "divider":
      printer.drawLine();
      return;
    case "newline":
      printer.newLine();
      return;
    case "cut":
      printer.cut();
      return;
  }
}

function buildInterface(config: PrinterConfig): string {
  switch (config.adapter) {
    case "escpos-tcp": {
      if (!config.host) {
        throw new Error(
          `Impresora "${config.label}" sin host configurado. Revisa Ajustes → Impresoras.`,
        );
      }
      const port = config.port ?? 9100;
      return `tcp://${config.host}:${port}`;
    }
    case "windows": {
      if (!config.printerName) {
        throw new Error(
          `Impresora "${config.label}" sin nombre Windows configurado.`,
        );
      }
      return `printer:${config.printerName}`;
    }
    default:
      throw new Error(`Impresora "${config.label}": adapter desconocido "${config.adapter}"`);
  }
}
