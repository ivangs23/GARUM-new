import { exec } from 'child_process';
import * as net from 'net';
import { promisify } from 'util';
import type { DiscoveredPrinter } from '../../shared/types';

const execAsync = promisify(exec);

// ─── Impresoras Windows (PowerShell) ──────────────────────────────────────────

export async function listWindowsPrinters(): Promise<DiscoveredPrinter[]> {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"',
      { timeout: 8000 },
    );
    const raw = JSON.parse(stdout.trim());
    const names: string[] = Array.isArray(raw) ? raw : [raw];
    return names.map(name => ({ type: 'windows' as const, name }));
  } catch {
    return [];
  }
}

// ─── Escáner de red (puerto 9100) ─────────────────────────────────────────────

const DEFAULT_SUBNETS = ['192.168.1', '192.168.0', '10.0.0'];

/**
 * Escanea subredes en busca de impresoras ESC/POS en puerto 9100.
 * Si se pasa customSubnet (ej. "192.168.5"), solo escanea esa subred.
 * De lo contrario usa las subredes por defecto.
 */
export async function scanNetworkPrinters(
  customSubnet?: string,
  timeoutMs: number = 600,
): Promise<DiscoveredPrinter[]> {
  const baseSubnets = customSubnet ? [customSubnet.trim()] : DEFAULT_SUBNETS;
  const found: DiscoveredPrinter[] = [];
  const checks: Promise<void>[] = [];

  for (const subnet of baseSubnets) {
    for (let i = 1; i <= 254; i++) {
      const host = `${subnet}.${i}`;
      checks.push(
        probePort(host, 9100, timeoutMs).then(open => {
          if (open) found.push({ type: 'tcp', host, port: 9100 });
        }),
      );
    }
  }

  await Promise.all(checks);

  // Ordenar por última parte de la IP
  return found.sort((a, b) => {
    const lastA = parseInt(a.host!.split('.').pop() ?? '0', 10);
    const lastB = parseInt(b.host!.split('.').pop() ?? '0', 10);
    return lastA - lastB;
  });
}

// ─── Helper TCP probe ─────────────────────────────────────────────────────────

function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let done = false;

    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error',   () => finish(false));
    socket.connect(port, host);
  });
}
