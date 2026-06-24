import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Order, PrinterConfig } from '../../shared/types';
import { buildTicketLines, type TicketDestination, type TicketLine } from '@garum/shared/ticket';
import { diag } from '../diag';

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
  // Class (no struct) porque StartDocPrinter recibe el parámetro como
  // [In, MarshalAs(LPStruct)] que exige reference type. Con struct value-type
  // PowerShell lanza "Combinación de tipos administrado y no administrado
  // no válida" al marshallar el parámetro #3.
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOA {
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
  public static int Send(string printerName, byte[] bytes) {
    // Códigos de retorno:
    //   bytes escritos  → éxito (>=1).
    //   -1 OpenPrinter fail   /   -2 StartDocPrinter fail
    //   -3 StartPagePrinter   /   -4 WritePrinter fail
    //   -5 written != bytes.Length (escritura truncada)
    IntPtr h;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "Garum Ticket";
    di.pDataType = "RAW";
    int result = -1;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero)) return -1;
    try {
      if (!StartDocPrinter(h, 1, di)) { result = -2; }
      else {
        try {
          if (!StartPagePrinter(h)) { result = -3; }
          else {
            Int32 written = 0;
            IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, p, bytes.Length);
            bool wrote = WritePrinter(h, p, bytes.Length, out written);
            Marshal.FreeCoTaskMem(p);
            EndPagePrinter(h);
            if (!wrote) result = -4;
            else if (written != bytes.Length) result = -5;
            else result = written;
          }
        } finally { EndDocPrinter(h); }
      }
    } finally { ClosePrinter(h); }
    return result;
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($env:GARUM_TICKET_FILE)
$result = [GarumRawPrinter]::Send($env:GARUM_PRINTER_NAME, $bytes)
if ($result -lt 1) {
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $stage = switch ($result) {
    -1 { "OpenPrinter" }
    -2 { "StartDocPrinter" }
    -3 { "StartPagePrinter" }
    -4 { "WritePrinter" }
    -5 { "WritePrinter (truncada)" }
    default { "desconocido" }
  }
  Write-Error "$stage falló (Win32 error $err, esperado=$($bytes.Length) bytes)"
  exit 1
}
if ($result -ne $bytes.Length) {
  Write-Error "Escritura parcial: $result de $($bytes.Length) bytes"
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
  if (printerConfig.adapter === 'windows-driver') {
    return printDriverTicket(order, printerConfig);
  }
  return printThermalTicket(order, printerConfig);
}

// ─── Impresión por DRIVER de Windows (documento de texto, GDI) ────────────────
// Para impresoras NO térmicas (láser / inkjet). Pensado para PODER PROBAR el
// flujo en una oficina sin térmica: en lugar de mandar ESC/POS RAW (que una
// láser no entiende y descarta, dejando el trabajo en "Impreso" sin papel),
// renderiza el ticket como texto plano y lo imprime con `Out-Printer`, que pasa
// por el driver y rasteriza en cualquier impresora.
//
// NO usar en producción con térmicas: ahí van 'escpos-tcp' (red) o 'windows'
// (RAW). Este modo ignora cortes/negritas/tamaños ESC/POS; solo saca el texto.
async function printDriverTicket(order: Order, config: PrinterConfig): Promise<void> {
  const printerName = config.printerName;
  if (!printerName) {
    throw new Error(`Impresora "${config.label}" sin nombre Windows configurado.`);
  }

  const destination = config.destination as TicketDestination;
  const lines = buildTicketLines(order, destination);

  const hasItemLines = lines.some(l => l.kind === 'text' && /^\d+x  /.test(l.text));
  if (!hasItemLines) {
    diag(`[Printer] skip "${printerName}" (driver) — sin items para destino ${destination}`);
    return;
  }

  const text = linesToPlainText(lines);
  const stamp = Date.now();
  const tmpTxt = join(tmpdir(), `garum_${stamp}.txt`);
  // BOM UTF-8 para que Out-Printer respete los acentos.
  writeFileSync(tmpTxt, '﻿' + text, { encoding: 'utf8' });

  const safeName = printerName.replace(/'/g, "''");
  const safePath = tmpTxt.replace(/'/g, "''");
  try {
    diag(
      `[Printer] (driver) enviando a "${printerName}" — orden ${order.id} mesa ${order.table_number}`,
    );
    await execAsync(
      `powershell -NoProfile -Command "Get-Content -LiteralPath '${safePath}' -Raw | Out-Printer -Name '${safeName}'"`,
      { timeout: 20000 },
    );
    diag(`[Printer] (driver) OK "${printerName}" — orden ${order.id} mesa ${order.table_number}`);
  } catch (err) {
    const detail = extractExecError(err);
    throw new Error(`No se pudo imprimir por driver en "${printerName}". ${detail}`);
  } finally {
    try { unlinkSync(tmpTxt); } catch { /* ignorar */ }
  }
}

// Convierte las líneas del ticket a texto plano legible en A4. Centra cabeceras,
// pone divisores con guiones y descarta el comando de corte (la láser expulsa
// la página al terminar el trabajo).
function linesToPlainText(lines: TicketLine[]): string {
  const WIDTH = 42;
  const out: string[] = [];
  for (const line of lines) {
    switch (line.kind) {
      case 'text': {
        let t = line.text;
        if (line.size === 2) t = t.toUpperCase();
        if (line.align === 'center') {
          const pad = Math.max(0, Math.floor((WIDTH - t.length) / 2));
          t = ' '.repeat(pad) + t;
        }
        out.push(t);
        break;
      }
      case 'divider':
        out.push('-'.repeat(WIDTH));
        break;
      case 'newline':
        out.push('');
        break;
      case 'cut':
        // Sin equivalente en papel A4; el driver expulsa la página al final.
        break;
    }
  }
  return out.join('\r\n') + '\r\n';
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
  if (!hasItemLines) {
    diag(`[Printer] skip "${printerName}" — sin items para destino ${destination}`);
    return;
  }

  const buffer = buildEscPosBuffer(lines);
  diag(
    `[Printer] enviando a "${printerName}" — orden ${order.id} mesa ${order.table_number} bytes=${buffer.length}`,
  );
  await sendRawToWindowsPrinter(printerName, buffer);
  diag(`[Printer] OK "${printerName}" — orden ${order.id} mesa ${order.table_number}`);
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Estados de PrinterStatus que indican un fallo real que el operador debe
// arreglar antes de imprimir. El resto (Normal/Idle/Printing/Processing/
// Busy/Waiting/IoActive…) son transitorios y dejamos pasar — winspool
// encolará el RAW y el retry resuelve si quedó atascado.
const HARD_PRINTER_FAILURE_STATES = new Set([
  'Offline',
  'Error',
  'Paused',
  'PaperOut',
  'PaperJam',
  'DoorOpen',
  'NoToner',
  'OutputBinFull',
  'NotAvailable',
  'UserInterventionRequired',
  'ServerUnknown',
]);

async function sendRawToWindowsPrinter(printerName: string, bytes: Buffer): Promise<void> {
  // Verifica existencia + rechaza sólo estados duros. Estados "ocupado"
  // (Printing, Processing, Busy, IoActive, Waiting) son normales justo
  // después del job anterior — no hay que tirar el envío por eso.
  const safeName = printerName.replace(/'/g, "''");
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "(Get-Printer -Name '${safeName}' -ErrorAction Stop).PrinterStatus"`,
      { timeout: 5000 },
    );
    const status = stdout.trim();
    if (status && HARD_PRINTER_FAILURE_STATES.has(status)) {
      throw new Error(
        `Impresora "${printerName}" no disponible (estado="${status}"). Revisa papel/tapa/conexión.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Impresora ')) throw err;
    const detail = extractExecError(err);
    throw new Error(`No se encontró la impresora "${printerName}" en Windows. ${detail}`);
  }

  const stamp = Date.now();
  const tmpBin = join(tmpdir(), `garum_${stamp}.bin`);
  const tmpPs1 = join(tmpdir(), `garum_${stamp}.ps1`);
  writeFileSync(tmpBin, bytes);
  // BOM UTF-8 para que PowerShell interprete bien acentos en la cadena C#.
  writeFileSync(tmpPs1, '﻿' + WIN_RAW_PS, { encoding: 'utf8' });

  // Retry interno: hasta 3 intentos con back-off 800ms. Cubre el caso de
  // winspool ocupado por el job anterior cuando el mutex de printer/index.ts
  // libera el slot pero el servicio aún está cerrando el handle.
  const MAX_TRIES = 3;
  let lastErr: unknown = null;
  try {
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
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
        return; // éxito
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_TRIES) await sleep(800 * attempt); // 800, 1600
      }
    }
    const detail = extractExecError(lastErr);
    throw new Error(
      `Spooler de Windows rechazó el envío a "${printerName}" tras ${MAX_TRIES} intentos. ${detail}`,
    );
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
//
// Patrón calcado del agente v2 (proyecto agente-impresora-v2,
// src/printer-service.js → imprimirEn):
//   - NO llamamos a isPrinterConnected() previamente: la mayoría de
//     impresoras térmicas en puerto 9100 sólo aceptan una conexión TCP
//     a la vez y, si abrimos un socket de "ping" justo antes del
//     execute(), la impresora todavía no ha cerrado el primero y el
//     segundo intento de conexión rechaza. Síntoma observado: "el
//     ticket a veces sale, a veces no".
//   - Reintentamos hasta MAX_TRIES con back-off. Mismo número de
//     intentos y delay que el agente v2 (3 × 2 s).

const TCP_MAX_TRIES = 3;
const TCP_RETRY_DELAY_MS = 2000;

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

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= TCP_MAX_TRIES; attempt++) {
    // Una instancia nueva por intento: si el anterior dejó bytes a
    // medias en el buffer interno, no contaminamos el siguiente envío.
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: iface,
      characterSet: CharacterSet.PC858_EURO,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });

    try {
      for (const line of lines) {
        emitLine(printer, line);
      }
      await printer.execute();
      return; // éxito
    } catch (err) {
      lastErr = err;
      try { printer.clear(); } catch { /* ignorar */ }
      if (attempt < TCP_MAX_TRIES) {
        await sleep(TCP_RETRY_DELAY_MS);
      }
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Impresora "${printerConfig.label}" (${iface}) no respondió tras ${TCP_MAX_TRIES} intentos: ${detail}`,
  );
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
