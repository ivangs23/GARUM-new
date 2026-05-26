import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Order, PrinterConfig } from '../../shared/types';
import { buildTicketLines, type TicketDestination, type TicketLine } from '@garum/shared/ticket';

const execAsync = promisify(exec);

// Helper PowerShell + C# que envía bytes RAW a la cola de impresión Win32
// (winspool.drv). Permite mandar ESC/POS sin que el driver lo procese como
// texto. Patrón de Microsoft KB 322091. Se inyecta en cada invocación: el
// coste de Add-Type es ~300-500 ms, asumible para un ticket por pedido.
const WIN_RAW_PS = `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class GarumRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static bool Send(string printerName, byte[] bytes) {
    IntPtr h;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "Garum Ticket";
    di.pDataType = "RAW";
    bool ok = false;
    if (OpenPrinter(printerName, out h, IntPtr.Zero)) {
      if (StartDocPrinter(h, 1, di)) {
        if (StartPagePrinter(h)) {
          Int32 written = 0;
          IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, p, bytes.Length);
          ok = WritePrinter(h, p, bytes.Length, out written);
          Marshal.FreeCoTaskMem(p);
          EndPagePrinter(h);
        }
        EndDocPrinter(h);
      }
      ClosePrinter(h);
    }
    return ok;
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($env:GARUM_TICKET_FILE)
$ok = [GarumRawPrinter]::Send($env:GARUM_PRINTER_NAME, $bytes)
if (-not $ok) {
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Error "WritePrinter failed (Win32 error $err)"
  exit 1
}
`;

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

// ─── Impresión via controlador Windows (ESC/POS RAW) ──────────────────────────
// Construye el buffer ESC/POS con node-thermal-printer (sin tocar la red) y lo
// inyecta en la cola de Windows con WritePrinter (dataType=RAW). El driver lo
// pasa directo a la impresora sin reinterpretarlo como GDI/texto, así que
// honra align, bold, tamaños y corte automático del propio comando ESC/POS.

async function printWindowsTicket(order: Order, config: PrinterConfig): Promise<void> {
  const printerName = config.printerName;
  if (!printerName) {
    throw new Error(`Impresora "${config.label}" sin nombre Windows configurado.`);
  }

  const destination = config.destination as TicketDestination;
  const lines = buildTicketLines(order, destination);

  const hasItemLines = lines.some(l => l.kind === 'text' && /^\d+x  /.test(l.text));
  if (!hasItemLines) return;

  const buffer = buildEscPosBuffer(lines);
  await sendRawToWindowsPrinter(printerName, buffer);
}

function buildEscPosBuffer(lines: TicketLine[]): Buffer {
  // Interfaz tcp://… es lazy: no abre socket hasta execute(). Aquí solo
  // usamos getBuffer() para extraer los bytes acumulados.
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://127.0.0.1:9100',
    characterSet: CharacterSet.PC858_EURO,
    removeSpecialCharacters: false,
  });

  for (const line of lines) {
    emitLine(printer, line);
  }

  return printer.getBuffer();
}

async function sendRawToWindowsPrinter(printerName: string, bytes: Buffer): Promise<void> {
  // Validamos antes de gastar el Add-Type de PowerShell.
  const safeName = printerName.replace(/'/g, "''");
  try {
    await execAsync(
      `powershell -NoProfile -Command "Get-Printer -Name '${safeName}' -ErrorAction Stop | Out-Null"`,
      { timeout: 5000 },
    );
  } catch (err) {
    const detail = extractExecError(err);
    throw new Error(`No se encontró la impresora "${printerName}" en Windows. ${detail}`);
  }

  const stamp = Date.now();
  const tmpBin = join(tmpdir(), `garum_${stamp}.bin`);
  const tmpPs1 = join(tmpdir(), `garum_${stamp}.ps1`);
  writeFileSync(tmpBin, bytes);
  // BOM UTF-8 para que PowerShell interprete bien acentos en la cadena C#.
  writeFileSync(tmpPs1, '﻿' + WIN_RAW_PS, { encoding: 'utf8' });

  try {
    await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`,
      {
        timeout: 20000,
        env: {
          ...process.env,
          GARUM_PRINTER_NAME: printerName,
          GARUM_TICKET_FILE: tmpBin,
        },
      },
    );
  } catch (err) {
    const detail = extractExecError(err);
    throw new Error(`Spooler de Windows rechazó el envío a "${printerName}". ${detail}`);
  } finally {
    try { unlinkSync(tmpBin); } catch { /* ignorar */ }
    try { unlinkSync(tmpPs1); } catch { /* ignorar */ }
  }
}

function extractExecError(err: unknown): string {
  const e = err as { stderr?: string; stdout?: string; message?: string };
  const stderr = (e.stderr ?? '').toString().trim();
  const stdout = (e.stdout ?? '').toString().trim();
  const msg = (e.message ?? '').toString().trim();
  // Preferimos stderr (más específico de PowerShell), luego stdout, luego message.
  const detail = stderr || stdout || msg || 'Sin detalles del sistema.';
  // Acortar para que quepa en alert (200 chars suelen ser suficientes).
  return detail.length > 400 ? detail.slice(0, 400) + '…' : detail;
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
