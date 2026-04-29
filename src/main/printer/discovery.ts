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
const MAX_CONCURRENCY = 64; // sockets simultáneos

/**
 * Escanea subredes en busca de impresoras ESC/POS en puerto 9100.
 *
 * Limita el número de sockets concurrentes para no saturar el firewall
 * ni congelar la máquina cuando se escanean cientos de hosts. El
 * comportamiento previo lanzaba ~762 sockets en paralelo y disparaba
 * advertencias de algunos antivirus.
 */
export async function scanNetworkPrinters(
  customSubnet?: string,
  timeoutMs: number = 600,
): Promise<DiscoveredPrinter[]> {
  const baseSubnets = customSubnet ? [customSubnet.trim()] : DEFAULT_SUBNETS;
  const found: DiscoveredPrinter[] = [];

  const targets: string[] = [];
  for (const subnet of baseSubnets) {
    for (let i = 1; i <= 254; i++) targets.push(`${subnet}.${i}`);
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= targets.length) return;
      const host = targets[idx];
      const open = await probePort(host, 9100, timeoutMs);
      if (open) found.push({ type: 'tcp', host, port: 9100 });
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, targets.length) },
    () => worker(),
  );
  await Promise.all(workers);

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
