import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Order, PrinterConfig } from '../../shared/types';
import { buildTicketLines, type TicketDestination, type TicketLine } from '@garum/shared/ticket';

const execAsync = promisify(exec);

// ─── Punto de entrada ─────────────────────────────────────────────────────────

export async function printOrderTicket(
  order: Order,
  printerConfig: PrinterConfig,
): Promise<void> {
  if (printerConfig.adapter === 'windows') {
    return printWindowsTicket(order, printerConfig);
  }
  return printThermalTicket(order, printerConfig);
}

// ─── Impresión via controlador Windows (GDI) ──────────────────────────────────
// Funciona con cualquier impresora registrada en Windows: laser, inkjet, PDF, etc.
// Usa PowerShell Out-Printer (disponible desde Windows 8 / PS 3.0).

async function printWindowsTicket(order: Order, config: PrinterConfig): Promise<void> {
  const printerName = config.printerName;
  if (!printerName) {
    throw new Error(`Impresora "${config.label}" sin nombre Windows configurado.`);
  }

  const destination = config.destination as TicketDestination;
  const lines = buildTicketLines(order, destination);
  const text = linesToText(lines);

  // Si tras construir el ticket no hay nada que imprimir, salimos silenciosamente.
  if (!text.trim()) return;

  await sendToWindowsPrinter(printerName, text);
}

function linesToText(lines: TicketLine[]): string {
  return lines
    .map(l => {
      switch (l.kind) {
        case 'text':    return l.text;
        case 'divider': return '-'.repeat(40);
        case 'newline': return '';
        case 'cut':     return '';
      }
    })
    .join('\r\n');
}

async function sendToWindowsPrinter(printerName: string, text: string): Promise<void> {
  // Primero verificamos que la impresora existe y está accesible.
  const safeName = printerName.replace(/'/g, "''");
  await execAsync(
    `powershell -NoProfile -Command "Get-Printer -Name '${safeName}' -ErrorAction Stop | Out-Null"`,
    { timeout: 5000 },
  );

  // Escribimos el contenido en un archivo temporal y lo mandamos a la impresora.
  const tmpFile = join(tmpdir(), `garum_${Date.now()}.txt`);
  writeFileSync(tmpFile, text, { encoding: 'utf8' });
  const safeFile = tmpFile.replace(/'/g, "''");

  try {
    await execAsync(
      `powershell -NoProfile -Command "Get-Content -Path '${safeFile}' -Raw | Out-Printer -Name '${safeName}'"`,
      { timeout: 15000 },
    );
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignorar */ }
  }
}

// ─── Impresión térmica ESC/POS via TCP ────────────────────────────────────────

async function printThermalTicket(order: Order, printerConfig: PrinterConfig): Promise<void> {
  const destination = printerConfig.destination as TicketDestination;
  const lines = buildTicketLines(order, destination);

  const hasItemLines = lines.some(l => l.kind === 'text' && /^\d+x  /.test(l.text));
  if (!hasItemLines) return;

  if (!printerConfig.host) {
    throw new Error(
      `Impresora "${printerConfig.label}" sin host configurado. Revisa Ajustes → Impresoras.`,
    );
  }

  const iface = `tcp://${printerConfig.host}:${printerConfig.port ?? 9100}`;

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
    case 'text': {
      if (line.align === 'center') printer.alignCenter();
      else if (line.align === 'right') printer.alignRight();
      else printer.alignLeft();
      printer.bold(line.bold ?? false);
      if (line.size === 2) printer.setTextSize(1, 1);
      else printer.setTextNormal();
      printer.println(line.text);
      printer.bold(false);
      printer.setTextNormal();
      return;
    }
    case 'divider':
      printer.drawLine();
      return;
    case 'newline':
      printer.newLine();
      return;
    case 'cut':
      printer.cut();
      return;
  }
}
