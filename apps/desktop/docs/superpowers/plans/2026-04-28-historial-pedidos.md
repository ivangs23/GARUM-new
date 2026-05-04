# Historial de Pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar pedidos del día (incluyendo `done`) en el panel cocina/barra y los pedidos de días anteriores en una pestaña "Historial" del sidebar.

**Architecture:** Cache "hoy" en main (Map en memoria, alimentado por Realtime) + handler IPC `history:list` que consulta Supabase paginado bajo demanda. Renderer recibe pedidos del día por IPC, muestra los `done` atenuados al fondo de cada columna. Página Historial nueva con scroll infinito y agrupación por fecha.

**Tech Stack:** Electron 33, React 19, Supabase JS 2.x, Playwright para E2E, Vitest (a añadir) para unit tests de helpers puros.

**Spec:** [docs/superpowers/specs/2026-04-28-historial-pedidos-design.md](../specs/2026-04-28-historial-pedidos-design.md)

**Pre-requisito (manual):** verificar que la conexión Realtime funciona después del fix `ELECTRON_RUN_AS_NODE`. Lanzar `npm run dev` y confirmar en consola del main `[Realtime] subscribe status= SUBSCRIBED`. Si no llega a `SUBSCRIBED`, parar y arreglar antes de empezar este plan.

---

## File Structure

**Create:**
- `src/main/today.ts` — helpers puros de zona horaria Madrid
- `src/main/history.ts` — query paginada de historial
- `src/renderer/src/pages/History.tsx` — página Historial
- `tests/unit/today.test.ts` — tests unitarios helpers
- `tests/e2e/history.spec.ts` — e2e historial
- `tests/e2e/orders-done.spec.ts` — e2e pedidos done dimmed
- `vitest.config.ts` — config vitest

**Modify:**
- `package.json` — añadir vitest dev dep + script `test:unit`
- `src/shared/types.ts` — añadir `HISTORY_LIST` channel
- `src/preload/index.ts` — exponer `listHistory`
- `src/main/realtime.ts` — quitar filtro `staff_status`, usar `isToday`, añadir timer medianoche
- `src/main/ipc.ts` — registrar handler `HISTORY_LIST`
- `src/renderer/src/App.tsx` — pestaña "Historial" en sidebar
- `src/renderer/src/pages/Orders.tsx` — render `done` atenuados al fondo

---

## Task 1: Setup Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest as dev dep**

```bash
npm install --save-dev vitest@^1
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 3: Add test:unit script to package.json**

In `scripts`, add: `"test:unit": "vitest run"` and `"test:unit:watch": "vitest"`.

- [ ] **Step 4: Verify it runs (no tests yet)**

Run: `npm run test:unit`
Expected: `No test files found, exiting with code 1` — confirma que vitest está instalado pero sin tests todavía.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit tests"
```

---

## Task 2: Date helpers — startOfTodayMadridIso

**Files:**
- Create: `src/main/today.ts`
- Test: `tests/unit/today.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/today.test.ts
import { describe, it, expect } from 'vitest';
import { startOfTodayMadridIso } from '../../src/main/today';

describe('startOfTodayMadridIso', () => {
  it('devuelve 00:00 Madrid en formato ISO UTC para una fecha en CEST (verano)', () => {
    // 15 jun 2026 14:30 UTC → en Madrid son las 16:30 CEST (UTC+2)
    // Inicio del día Madrid 2026-06-15 → 2026-06-15 00:00 CEST = 2026-06-14 22:00 UTC
    const now = new Date('2026-06-15T14:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-06-14T22:00:00.000Z');
  });

  it('devuelve 00:00 Madrid en CET (invierno)', () => {
    // 15 ene 2026 14:30 UTC → en Madrid son las 15:30 CET (UTC+1)
    // Inicio del día Madrid 2026-01-15 → 2026-01-15 00:00 CET = 2026-01-14 23:00 UTC
    const now = new Date('2026-01-15T14:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-01-14T23:00:00.000Z');
  });

  it('a las 00:30 UTC en CEST devuelve el día actual de Madrid (mismo día UTC)', () => {
    // 15 jun 2026 00:30 UTC → en Madrid son las 02:30 CEST del 15 jun
    // Inicio de "hoy" Madrid = 14 jun 22:00 UTC
    const now = new Date('2026-06-15T00:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-06-14T22:00:00.000Z');
  });

  it('a las 23:30 UTC en CEST devuelve el día siguiente UTC (porque ya es el día siguiente en Madrid)', () => {
    // 15 jun 2026 23:30 UTC → en Madrid son las 01:30 CEST del 16 jun
    // Inicio de "hoy" Madrid = 15 jun 22:00 UTC
    const now = new Date('2026-06-15T23:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-06-15T22:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:unit`
Expected: `Cannot find module '../../src/main/today'` o similar.

- [ ] **Step 3: Implement startOfTodayMadridIso**

Create `src/main/today.ts`:

```ts
/**
 * Devuelve el inicio del día actual en Europe/Madrid, expresado en ISO UTC.
 * Maneja CET/CEST automáticamente vía Intl.
 */
export function startOfTodayMadridIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const hRaw = get('hour');
  const h = parseInt(hRaw === '24' ? '00' : hRaw, 10);
  const m = parseInt(get('minute'), 10);
  const s = parseInt(get('second'), 10);
  const ms = now.getMilliseconds();

  const elapsedMs = ((h * 60 + m) * 60 + s) * 1000 + ms;
  const todayMidnightUtc = new Date(now.getTime() - elapsedMs);
  return todayMidnightUtc.toISOString();
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:unit`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/today.ts tests/unit/today.test.ts
git commit -m "feat(today): add startOfTodayMadridIso helper"
```

---

## Task 3: Date helpers — isToday

**Files:**
- Modify: `src/main/today.ts`
- Modify: `tests/unit/today.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/today.test.ts`:

```ts
import { isToday } from '../../src/main/today';

describe('isToday', () => {
  it('true cuando created_at y now caen en el mismo día Madrid', () => {
    const now = new Date('2026-06-15T14:30:00Z'); // 16:30 Madrid CEST
    expect(isToday('2026-06-15T08:00:00Z', now)).toBe(true); // 10:00 Madrid mismo día
  });

  it('false cuando created_at es de ayer Madrid', () => {
    const now = new Date('2026-06-15T10:00:00Z'); // 12:00 Madrid
    expect(isToday('2026-06-14T20:00:00Z', now)).toBe(false); // 22:00 ayer Madrid
  });

  it('considera el cruce de medianoche local correctamente', () => {
    const now = new Date('2026-06-15T22:30:00Z'); // 00:30 del 16 jun Madrid
    // Un pedido a las 23:30 UTC = 01:30 del 16 jun Madrid → mismo día Madrid
    expect(isToday('2026-06-15T23:30:00Z', now)).toBe(true);
    // Un pedido a las 21:30 UTC = 23:30 del 15 jun Madrid → día anterior Madrid
    expect(isToday('2026-06-15T21:30:00Z', now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:unit`
Expected: `isToday is not exported`.

- [ ] **Step 3: Implement isToday**

Append to `src/main/today.ts`:

```ts
const madridDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * Devuelve true si `iso` cae en el mismo día Madrid que `now`.
 */
export function isToday(iso: string, now: Date = new Date()): boolean {
  return madridDayFmt.format(new Date(iso)) === madridDayFmt.format(now);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:unit`
Expected: 7 tests pass (4 anteriores + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/main/today.ts tests/unit/today.test.ts
git commit -m "feat(today): add isToday helper"
```

---

## Task 4: Date helpers — msUntilNextMidnightMadrid

**Files:**
- Modify: `src/main/today.ts`
- Modify: `tests/unit/today.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/today.test.ts`:

```ts
import { msUntilNextMidnightMadrid } from '../../src/main/today';

describe('msUntilNextMidnightMadrid', () => {
  it('a mediodía Madrid devuelve 12h en ms', () => {
    // 15 jun 2026 10:00 UTC = 12:00 Madrid CEST → faltan 12h
    const now = new Date('2026-06-15T10:00:00Z');
    expect(msUntilNextMidnightMadrid(now)).toBe(12 * 60 * 60 * 1000);
  });

  it('a las 23:30 Madrid devuelve 30 min en ms', () => {
    // 15 jun 2026 21:30 UTC = 23:30 Madrid CEST → faltan 30 min
    const now = new Date('2026-06-15T21:30:00Z');
    expect(msUntilNextMidnightMadrid(now)).toBe(30 * 60 * 1000);
  });

  it('siempre devuelve un valor en (0, 25h]', () => {
    const moments = [
      '2026-01-01T00:00:00Z',
      '2026-03-29T00:30:00Z', // día spring-forward CET→CEST
      '2026-10-25T01:30:00Z', // día fall-back CEST→CET
      '2026-12-31T23:59:00Z',
    ];
    for (const iso of moments) {
      const ms = msUntilNextMidnightMadrid(new Date(iso));
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:unit`
Expected: `msUntilNextMidnightMadrid is not exported`.

- [ ] **Step 3: Implement msUntilNextMidnightMadrid**

Append to `src/main/today.ts`:

```ts
/**
 * Milisegundos hasta la próxima medianoche Madrid. Maneja DST porque usa
 * `startOfTodayMadridIso` con una fecha 25h adelante.
 */
export function msUntilNextMidnightMadrid(now: Date = new Date()): number {
  const ahead25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const tomorrowMidnight = new Date(startOfTodayMadridIso(ahead25h));
  return tomorrowMidnight.getTime() - now.getTime();
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:unit`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/today.ts tests/unit/today.test.ts
git commit -m "feat(today): add msUntilNextMidnightMadrid helper"
```

---

## Task 5: IPC channel HISTORY_LIST + preload API

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add HISTORY_LIST channel to IPC**

In `src/shared/types.ts`, add inside the `IPC` object:

```ts
export const IPC = {
  // ... existentes ...
  PRINTERS_TEST:           'printers:test',
  HISTORY_LIST:            'history:list',
} as const;
```

- [ ] **Step 2: Expose listHistory in preload**

In `src/preload/index.ts`, add inside the `api` object (después de `testPrinter`):

```ts
  // ── Historial ─────────────────────────────────────────────────────────────
  listHistory: (limit: number, offset: number): Promise<Order[]> =>
    ipcRenderer.invoke(IPC.HISTORY_LIST, { limit, offset }),
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: build succeeds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts
git commit -m "feat(ipc): add HISTORY_LIST channel"
```

---

## Task 6: history.ts query function

**Files:**
- Create: `src/main/history.ts`
- Test: `tests/e2e/history.spec.ts` (lo creamos vacío y lo iremos llenando en tareas siguientes)

- [ ] **Step 1: Write E2E test that exercises the IPC channel via mock**

Create `tests/e2e/history.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { launchApp, mockIpcHandle, type LaunchedApp } from './helpers/launch';
import type { Order } from '../../src/shared/types';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

const historyOrder: Order = {
  id: 'hist-001',
  table_number: 3,
  total_amount: 18.5,
  payment_status: 'paid',
  staff_status: 'done',
  created_at: '2026-04-27T20:00:00.000Z',
  items: [{ id: 'i1', name: 'Croquetas', price: 8.0, quantity: 2, destination: 'cocina' }],
};

test('window.api.listHistory invoca el handler IPC y recibe pedidos', async () => {
  const { app: electronApp, window } = app;

  await mockIpcHandle(electronApp, 'history:list', [historyOrder]);

  const result = await window.evaluate(async () =>
    (window as any).api.listHistory(50, 0),
  );

  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('hist-001');
});
```

- [ ] **Step 2: Run e2e test, verify it fails**

Run: `npm run test:e2e -- history.spec.ts`
Expected: failure ya que aún no existe el handler `history:list`. El test usa `mockIpcHandle` que reemplaza el handler — pero ipcMain.removeHandler tira si el handler nunca existió. Verificar el error exacto.

Si el error es `removeHandler` tirando porque no existe handler previo, ese es el síntoma esperado: hay que crear el handler base primero.

- [ ] **Step 3: Implement listHistory in main**

Create `src/main/history.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { startOfTodayMadridIso } from './today';
import type { Order } from '../shared/types';

/**
 * Lista pedidos anteriores al día actual (Europe/Madrid), incluye paid y cancelled.
 * Pagina por offset/limit. Devuelve array vacío si supabase no está conectado o hay error.
 */
export async function listHistory(
  supabase: SupabaseClient | null,
  limit: number,
  offset: number,
): Promise<Order[]> {
  if (!supabase) return [];
  const startToday = startOfTodayMadridIso();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('payment_status', ['paid', 'cancelled'])
    .lt('created_at', startToday)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[History] Error listando historial:', error.message);
    return [];
  }
  return (data ?? []) as Order[];
}
```

- [ ] **Step 4: Commit (handler IPC viene en Task 7)**

```bash
git add src/main/history.ts tests/e2e/history.spec.ts
git commit -m "feat(history): add listHistory query function"
```

---

## Task 7: IPC handler for HISTORY_LIST

**Files:**
- Modify: `src/main/realtime.ts` (exportar `getSupabase()` para que ipc.ts pueda pasarlo)
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Expose supabase reference from realtime module**

En `src/main/realtime.ts`, añadir al final del archivo (junto a otros exports):

```ts
/** Devuelve la instancia activa de Supabase (puede ser null si aún no conectado). */
export function getSupabase() {
  return supabase;
}
```

- [ ] **Step 2: Register HISTORY_LIST handler**

En `src/main/ipc.ts`, añadir el import y el handler:

```ts
import { getOrders, markOrderDone, getSupabase } from './realtime';
import { listHistory } from './history';
// ... resto de imports existentes ...

// Dentro de setupIpc(win), tras los handlers existentes:
  // ── Historial ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_LIST, async (_e, args: { limit: number; offset: number }) => {
    return listHistory(getSupabase(), args.limit, args.offset);
  });
```

- [ ] **Step 3: Run e2e test, verify it now passes**

Run: `npm run test:e2e -- history.spec.ts`
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/main/realtime.ts src/main/ipc.ts
git commit -m "feat(ipc): wire HISTORY_LIST handler"
```

---

## Task 8: Initial query incluye pedidos done de hoy

**Files:**
- Modify: `src/main/realtime.ts`

- [ ] **Step 1: Replace initial query con filtro por fecha (sin filtro staff_status)**

En `src/main/realtime.ts`, reemplazar el bloque de fetch inicial dentro de `startRealtimeListener` para que use `startOfTodayMadridIso()` en lugar de `.neq('staff_status', 'done')`. Importa el helper al principio del archivo:

```ts
import { startOfTodayMadridIso, isToday, msUntilNextMidnightMadrid } from './today';
```

Reemplazar la query existente:

```ts
  // Carga inicial de pedidos de HOY (paid, sea cual sea staff_status)
  const startToday = startOfTodayMadridIso();
  console.log('[Realtime] Iniciando fetch inicial desde', startToday);
  let data: Order[] | null = null;
  let error: { message: string } | null = null;
  try {
    const res = await supabase
      .from('orders')
      .select('*')
      .eq('payment_status', 'paid')
      .gte('created_at', startToday)
      .order('created_at', { ascending: true })
      .limit(200);
    data = res.data as Order[] | null;
    error = res.error;
  } catch (e) {
    console.error('[Realtime] EXCEPCIÓN en fetch inicial:', e);
    sendStatus(win, 'disconnected');
    scheduleReconnect();
    return;
  }
```

(Sustituye al fetch existente que usaba `.neq('staff_status', 'done')`.)

- [ ] **Step 2: Build and run app, verify cache contiene `done`**

Esta es una verificación manual con la app real (ya hay realtime funcionando):

```bash
npm run dev
```

En DevTools del renderer, ejecutar `window.api.getOrders()` — la lista debe incluir pedidos del día con `staff_status === 'done'` si existían en BD. (El renderer aún los muestra todos como activos; eso lo arreglamos en Task 11.)

- [ ] **Step 3: Commit**

```bash
git add src/main/realtime.ts
git commit -m "feat(realtime): incluir pedidos done de hoy en cache inicial"
```

---

## Task 9: postgres_changes handler usa isToday y conserva done

**Files:**
- Modify: `src/main/realtime.ts`

- [ ] **Step 1: Reemplazar handleChange con lógica nueva**

En `src/main/realtime.ts`, sustituir la función `handleChange` existente por:

```ts
function handleChange(order: Order, win: BrowserWindow): void {
  if (!order?.id) return;

  // Solo nos importan los cambios de hoy. Los de días anteriores se consultan
  // bajo demanda en la pestaña Historial.
  if (!isToday(order.created_at)) {
    console.log('[Realtime] Cambio ignorado, no es de hoy:', order.id);
    return;
  }

  // Pedidos cancelados de hoy → quitar del cache (no se muestran en panel principal).
  if (order.payment_status === 'cancelled') {
    if (orders.has(order.id)) {
      orders.delete(order.id);
      win.webContents.send(IPC.ORDERS_REMOVED, order.id);
    }
    return;
  }

  // Pedidos paid de hoy → upsert en cache, notificar.
  if (order.payment_status !== 'paid') return;

  const isNew = !orders.has(order.id);
  orders.set(order.id, order);
  win.webContents.send(IPC.ORDERS_NEW, order);

  // Notificación + impresión solo en pedidos *recién entrantes* y aún pendientes.
  if (isNew && order.staff_status !== 'done') {
    updateTrayStatus('new-order');
    notify(order);
    setTimeout(() => updateTrayStatus('connected'), 8000);

    const { printers } = loadConfig();
    if (printers.length > 0) {
      printOrder(order, printers).catch(err =>
        console.error('[Realtime] Error al imprimir:', err),
      );
    }
  }
}
```

Diferencias frente al original:
- Filtra por `isToday(order.created_at)` antes de tocar nada.
- Cancelled → remove (antes el handler genérico borraba cualquier non-active).
- Paid done → upsert (antes se borraba).
- Notificación/impresión solo cuando `isNew && staff_status !== 'done'`.

- [ ] **Step 2: Fix markOrderDone — no borrar del cache**

En `src/main/realtime.ts`, modificar `markOrderDone`:

```ts
export async function markOrderDone(id: string): Promise<void> {
  if (!supabase) return;
  // No tocamos `orders` aquí — la actualización en BD genera un postgres_changes
  // que reentra por handleChange y deja el pedido con staff_status='done' en cache.
  const { error } = await supabase
    .from('orders')
    .update({ staff_status: 'done' })
    .eq('id', id);
  if (error) console.error('[Realtime] Error marcando como listo:', error.message);
}
```

(Quitar `orders.delete(id);` del original.)

- [ ] **Step 3: Update getOrders sort to keep done at the end**

Modificar `getOrders` en `src/main/realtime.ts` para que ordene primero por staff_status (pending antes que done), luego por fecha:

```ts
export function getOrders(): Order[] {
  return [...orders.values()].sort((a, b) => {
    // pending arriba, done al fondo
    if (a.staff_status !== b.staff_status) {
      return a.staff_status === 'done' ? 1 : -1;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/main/realtime.ts
git commit -m "feat(realtime): handler usa isToday, conserva done en cache"
```

---

## Task 10: Midnight timer en realtime.ts

**Files:**
- Modify: `src/main/realtime.ts`

- [ ] **Step 1: Add timer logic**

En `src/main/realtime.ts`, declarar el timer junto a las otras variables de módulo:

```ts
let midnightTimer: ReturnType<typeof setTimeout> | null = null;
```

Añadir función `scheduleMidnightRollover` cerca del final del archivo (antes de los helpers `sendStatus`/`notify`):

```ts
/**
 * Programa un setTimeout a la próxima medianoche Madrid. Al disparar:
 * 1) Refetch del cache (queda vacío al inicio del nuevo día).
 * 2) Reposiciona el siguiente timer.
 * 3) Notifica al renderer con un ORDERS_INIT vacío.
 */
function scheduleMidnightRollover(win: BrowserWindow): void {
  if (midnightTimer) clearTimeout(midnightTimer);
  const ms = msUntilNextMidnightMadrid();
  console.log('[Realtime] Próximo cambio de día en', Math.round(ms / 60000), 'min');
  midnightTimer = setTimeout(async () => {
    console.log('[Realtime] Cambio de día — refrescando cache');
    if (!supabase || !savedWin || savedWin.isDestroyed()) return;
    const startToday = startOfTodayMadridIso();
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('payment_status', 'paid')
        .gte('created_at', startToday)
        .order('created_at', { ascending: true })
        .limit(200);
      if (!error) {
        orders.clear();
        (data as Order[] ?? []).forEach(o => orders.set(o.id, o));
        win.webContents.send(IPC.ORDERS_INIT, [...orders.values()]);
      }
    } catch (e) {
      console.error('[Realtime] Error en cambio de día:', e);
    }
    scheduleMidnightRollover(win);
  }, ms);
}
```

- [ ] **Step 2: Call scheduleMidnightRollover after subscription succeeds**

Dentro del callback `.subscribe(...)` en `startRealtimeListener`, en el caso `SUBSCRIBED`:

```ts
    .subscribe((status, err) => {
      console.log('[Realtime] subscribe status=', status, 'err=', err?.message ?? 'null');
      if (status === 'SUBSCRIBED') {
        retryDelay = 5000;
        sendStatus(win, 'connected');
        scheduleMidnightRollover(win);   // ← nuevo
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        sendStatus(win, 'disconnected');
        scheduleReconnect();
      }
    });
```

- [ ] **Step 3: Clean up timer in stopRealtimeListener**

Modificar `stopRealtimeListener`:

```ts
export function stopRealtimeListener(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (midnightTimer) { clearTimeout(midnightTimer); midnightTimer = null; }
  // ... resto igual ...
}
```

- [ ] **Step 4: Build verification**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/main/realtime.ts
git commit -m "feat(realtime): añadir timer de medianoche Madrid"
```

---

## Task 11: Render done orders dimmed at bottom of column

**Files:**
- Modify: `src/renderer/src/pages/Orders.tsx`
- Create: `tests/e2e/orders-done.spec.ts`

- [ ] **Step 1: Write failing E2E test**

Create `tests/e2e/orders-done.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { launchApp, pushFromMain, type LaunchedApp } from './helpers/launch';
import type { Order } from '../../src/shared/types';

let app: LaunchedApp;
test.beforeEach(async () => { app = await launchApp(); });
test.afterEach (async () => { await app.close(); });

const pendingOrder: Order = {
  id: 'pend-1', table_number: 5, total_amount: 10, payment_status: 'paid',
  staff_status: 'pending', created_at: new Date().toISOString(),
  items: [{ id: 'i1', name: 'Calamares', price: 10, quantity: 1, destination: 'cocina' }],
};
const doneOrder: Order = {
  id: 'done-1', table_number: 9, total_amount: 5, payment_status: 'paid',
  staff_status: 'done', created_at: new Date(Date.now() - 60_000).toISOString(),
  items: [{ id: 'i1', name: 'Tortilla', price: 5, quantity: 1, destination: 'cocina' }],
};

test('un pedido done aparece atenuado y sin botón LISTO', async () => {
  const { app: electronApp, window } = app;
  await expect(window.getByText('Pedidos activos')).toBeVisible();

  await pushFromMain(electronApp, 'orders:init', [pendingOrder, doneOrder]);

  // Pendiente: tarjeta con botón LISTO
  await expect(window.getByText('Calamares')).toBeVisible();
  await expect(window.getByRole('button', { name: /✓ LISTO/ })).toBeVisible();

  // Done: visible, mesa visible, pero su tarjeta NO tiene botón LISTO
  await expect(window.getByText('Tortilla')).toBeVisible();
  // Solo hay UN botón LISTO en cocina (el del pendiente)
  const listoButtons = window.getByRole('button', { name: /✓ LISTO/ });
  await expect(listoButtons).toHaveCount(1);

  // La tarjeta done lleva data-done="true" (selector que añadiremos para que el test sea estable)
  await expect(window.locator('[data-done="true"]').first()).toBeVisible();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:e2e -- orders-done.spec.ts`
Expected: fail (la tarjeta done sigue mostrando LISTO).

- [ ] **Step 3: Modify OrderCard to accept done variant**

En `src/renderer/src/pages/Orders.tsx`, modificar `OrderCard`:

```tsx
function OrderCard({ order, dest, onDone }: {
  order: Order;
  dest: 'cocina' | 'barra';
  onDone: (id: string) => void;
}) {
  const isDone   = order.staff_status === 'done';
  const elapsed  = useElapsed(order.created_at);
  const items    = filterItems(order.items, dest);
  const secs     = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
  const isUrgent = !isDone && secs > 600;

  return (
    <div
      data-done={isDone ? 'true' : 'false'}
      style={{
        background: isDone ? '#0e0e0e' : isUrgent ? '#1a0f0f' : 'var(--surface)',
        border: `1px solid ${isDone ? 'var(--border)' : isUrgent ? 'rgba(239,68,68,.5)' : 'var(--border)'}`,
        borderRadius: 14, padding: '1rem', display: 'flex', flexDirection: 'column',
        gap: '0.75rem', animation: 'slideIn 0.25s ease',
        opacity: isDone ? 0.5 : 1,
      }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          background: isDone ? 'var(--muted)' : 'var(--primary)', color: '#fff',
          padding: '0.25rem 0.75rem', borderRadius: 6,
          fontWeight: 900, fontSize: '1.1rem',
        }}>
          MESA {order.table_number}
        </span>
        <span style={{
          fontSize: '0.78rem',
          color: isDone ? 'var(--muted)' : isUrgent ? 'var(--red)' : 'var(--muted)',
          fontFamily: 'monospace',
          fontWeight: isUrgent ? 700 : 400,
        }}>
          {isDone ? `✓ ${new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : `⏱ ${elapsed}`}
        </span>
      </div>

      {/* Ítems */}
      <ul style={{ listStyle: 'none', borderTop: '1px solid var(--border)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontFamily: 'monospace', fontSize: '0.9rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: isDone ? 'var(--muted)' : 'var(--primary)', fontWeight: 700, minWidth: 24 }}>{item.quantity}×</span>
            <span>{item.name}</span>
          </li>
        ))}
      </ul>

      {/* Acción solo en pendientes */}
      {!isDone && (
        <button
          onClick={() => onDone(order.id)}
          style={{
            background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.3)',
            borderRadius: 8, color: 'var(--green)', padding: '0.5rem',
            fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,222,128,.1)')}
        >
          ✓ LISTO
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Modify Column to render pending first then done**

En `src/renderer/src/pages/Orders.tsx`, dentro de `Column`, antes del JSX:

```tsx
  const active = orders.filter(o => filterItems(o.items, dest).length > 0);
  const pending = active.filter(o => o.staff_status !== 'done');
  const done    = active.filter(o => o.staff_status === 'done');
```

Y reemplazar el `.map` por dos:

```tsx
        {pending.map(o => (
          <OrderCard key={o.id + dest} order={o} dest={dest} onDone={onDone} />
        ))}
        {done.map(o => (
          <OrderCard key={o.id + dest} order={o} dest={dest} onDone={onDone} />
        ))}
        {pending.length === 0 && done.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '2.5rem 1rem',
            color: 'var(--muted)', fontSize: '0.85rem',
            border: '1px dashed var(--border)', borderRadius: 10,
          }}>
            Sin pedidos pendientes
          </div>
        )}
```

(Eliminar el bloque `{active.length === 0 && ...}` original.)

- [ ] **Step 5: Update upsert in Orders to keep done in array (it already does)**

El `upsert` actual (líneas 156-163) ya gestiona update vs add — no hace falta tocarlo. Pero confirmar que `markDone` deja el pedido en la lista:

Reemplazar `markDone` y `remove` en `Orders()`:

```tsx
  const markDone = async (id: string) => {
    // No quitamos de la lista local: el pedido sigue visible atenuado.
    // El main process actualizará staff_status='done' en BD; el evento de
    // Realtime devolverá un upsert con staff_status='done' que ya gestiona upsert.
    setOrders(prev => prev.map(o => o.id === id ? { ...o, staff_status: 'done' } : o));
    await window.api.markDone(id);
  };
```

(Quitar la llamada `remove(id)` del original. La función `remove` se sigue usando para `onOrderRemoved` events de cancelados — dejarla como está.)

- [ ] **Step 6: Run e2e test, verify it passes**

Run: `npm run test:e2e -- orders-done.spec.ts`
Expected: 1 test passes.

- [ ] **Step 7: Verify navigation test still passes**

Run: `npm run test:e2e -- navigation.spec.ts orders.spec.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Orders.tsx tests/e2e/orders-done.spec.ts
git commit -m "feat(orders): mostrar pedidos done atenuados al fondo"
```

---

## Task 12: Sidebar tab "Historial" + Page type extension

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write failing E2E test for navigation**

Append to `tests/e2e/navigation.spec.ts` (al final, antes del último `});` del archivo):

```ts
test('navega a la pestaña Historial desde el sidebar', async () => {
  app = await launchApp();
  const { window } = app;

  await window.getByRole('button', { name: /Historial/ }).click();
  await expect(window.getByRole('heading', { name: 'Historial' })).toBeVisible();
});
```

(Si el archivo ya tiene `beforeEach`/`afterEach` globales este test no necesita relanzar — eliminar `app = await launchApp();`. Adaptar al patrón existente del archivo.)

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:e2e -- navigation.spec.ts`
Expected: el botón Historial no existe → fail.

- [ ] **Step 3: Update Page type and sidebar nav**

En `src/renderer/src/App.tsx`:

```tsx
import History from './pages/History';

type Page = 'orders' | 'history' | 'settings';
```

Y dentro del `nav`, ampliar el array:

```tsx
{([
  ['orders',   '🍽 Comandas'],
  ['history',  '📜 Historial'],
  ['settings', '⚙️ Configuración'],
] as [Page, string][]).map(([p, label]) => (
  // ... botón existente ...
))}
```

Y ampliar el render del main:

```tsx
<main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
  {page === 'orders'   && <Orders />}
  {page === 'history'  && <History />}
  {page === 'settings' && <Settings onSaved={() => setPage('orders')} />}
</main>
```

- [ ] **Step 4: Create placeholder History.tsx (lo llenamos en Task 13)**

Create `src/renderer/src/pages/History.tsx`:

```tsx
export default function History() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Historial</h2>
      <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Cargando...</div>
    </div>
  );
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm run test:e2e -- navigation.spec.ts`
Expected: pasa el nuevo test.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/pages/History.tsx tests/e2e/navigation.spec.ts
git commit -m "feat(ui): añadir pestaña Historial al sidebar"
```

---

## Task 13: History page con grupos por día e infinite scroll

**Files:**
- Modify: `src/renderer/src/pages/History.tsx`
- Modify: `tests/e2e/history.spec.ts`

- [ ] **Step 1: Add E2E test for History page rendering**

Append to `tests/e2e/history.spec.ts`:

```ts
test('la página Historial muestra pedidos agrupados por fecha', async () => {
  const { app: electronApp, window } = app;

  // Mock con 2 pedidos en 2 días distintos
  const yesterday: Order = {
    id: 'h-yest', table_number: 4, total_amount: 12, payment_status: 'paid',
    staff_status: 'done',
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    items: [{ id: 'i1', name: 'Patatas', price: 6, quantity: 2, destination: 'cocina' }],
  };
  const twoDaysAgo: Order = {
    id: 'h-2d', table_number: 7, total_amount: 8, payment_status: 'paid',
    staff_status: 'done',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    items: [{ id: 'i1', name: 'Pulpo', price: 8, quantity: 1, destination: 'cocina' }],
  };
  await mockIpcHandle(electronApp, 'history:list', [yesterday, twoDaysAgo]);

  await window.getByRole('button', { name: /Historial/ }).click();

  // Cabecera "Ayer" y los items aparecen
  await expect(window.getByText('Ayer')).toBeVisible();
  await expect(window.getByText('Patatas')).toBeVisible();
  await expect(window.getByText('Pulpo')).toBeVisible();

  // Cabecera mesa visible para ambos pedidos
  await expect(window.getByText('Mesa 4')).toBeVisible();
  await expect(window.getByText('Mesa 7')).toBeVisible();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:e2e -- history.spec.ts`
Expected: el placeholder no muestra esos textos.

- [ ] **Step 3: Implement full History.tsx**

Reemplazar `src/renderer/src/pages/History.tsx` por:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Order } from '../../../shared/types';

const PAGE_SIZE = 50;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD UTC; agrupación aproximada que basta para listar
}

function HistoryCard({ order }: { order: Order }) {
  const time = new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const isCancelled = order.payment_status === 'cancelled';
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
      opacity: isCancelled ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>Mesa {order.table_number}</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--muted)' }}>{time}</span>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {order.items.map((it, i) => (
          <li key={i} style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{it.quantity}×</span> {it.name}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
        <span>{isCancelled ? 'Cancelado' : `Total ${order.total_amount.toFixed(2)} €`}</span>
      </div>
    </div>
  );
}

export default function History() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(async (currentOffset: number) => {
    if (loading || !hasMore) return;
    setLoading(true);
    const page = await window.api.listHistory(PAGE_SIZE, currentOffset);
    setOrders(prev => [...prev, ...page]);
    setOffset(currentOffset + page.length);
    if (page.length < PAGE_SIZE) setHasMore(false);
    setLoading(false);
  }, [loading, hasMore]);

  useEffect(() => {
    loadPage(0);
    // intencional: solo en mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadPage(offset);
    }, { rootMargin: '200px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [offset, loadPage]);

  // Agrupación por día
  const grouped = orders.reduce<Record<string, Order[]>>((acc, o) => {
    const k = dayKey(o.created_at);
    (acc[k] = acc[k] ?? []).push(o);
    return acc;
  }, {});
  const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Historial</h2>

      {orders.length === 0 && !loading && (
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
          Sin pedidos antiguos
        </div>
      )}

      {dayKeys.map(k => (
        <section key={k} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{
            fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--muted)', marginBottom: '0.6rem', borderBottom: '1px solid var(--border)',
            paddingBottom: '0.3rem',
          }}>
            {dayLabel(grouped[k][0].created_at)}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {grouped[k].map(o => <HistoryCard key={o.id} order={o} />)}
          </div>
        </section>
      ))}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loading && <div style={{ color: 'var(--muted)', textAlign: 'center', fontSize: '0.85rem' }}>Cargando...</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run e2e tests**

Run: `npm run test:e2e -- history.spec.ts`
Expected: ambos tests del fichero pasan.

- [ ] **Step 5: Run all e2e**

Run: `npm run test:e2e`
Expected: toda la suite verde.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/History.tsx tests/e2e/history.spec.ts
git commit -m "feat(history): página Historial con scroll infinito y agrupación por día"
```

---

## Task 14: Quitar logs de diagnóstico añadidos durante debugging

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/realtime.ts`
- Modify: `src/renderer/src/App.tsx`

Los logs `[Diag]` y los `console.log` en `sendStatus` que añadí antes de empezar el plan ya no son necesarios. Quitarlos para no inflar la consola en producción.

- [ ] **Step 1: Remove Diag logs from index.ts**

En `src/main/index.ts`, quitar las líneas con `console.log('[Diag] ...`. Dejar el flujo limpio:

```ts
  if (!isE2E && config.supabaseUrl && config.supabaseKey) {
    await startRealtimeListener(config.supabaseUrl, config.supabaseKey, mainWindow);
  }
});
```

- [ ] **Step 2: Reduce logging in realtime.ts**

Quitar:
- `console.log('[Realtime] createClient con url=...`
- `console.log('[Realtime] Iniciando fetch inicial desde', startToday)` → mantener este, es útil
- `console.log('[Realtime] Fetch inicial → error=', ...)` → mantener
- `console.log('[Realtime] Enviando ORDERS_INIT con', orders.size, 'pedidos')` → quitar
- `console.log('[Realtime] Suscribiéndose al canal garum_desktop…')` → quitar
- `console.log('[Realtime] postgres_changes →', ...)` → quitar
- `console.log('[Realtime] Cambio ignorado, no es de hoy:', order.id)` → quitar
- `console.log('[Realtime] sendStatus →', status, ...)` → quitar (volver a la versión sin log)

Mantener: errores, retry, status de subscribe, midnight rollover.

`sendStatus` vuelve a su forma original:

```ts
function sendStatus(win: BrowserWindow, status: ConnectionStatus): void {
  updateTrayStatus(status === 'connected' ? 'connected' : 'idle');
  win.webContents.send(IPC.CONNECTION_STATUS, status);
}
```

- [ ] **Step 3: Restore App.tsx connection listener (sin log)**

```tsx
  useEffect(() => {
    window.api.onConnectionStatus(s => setStatus(s));
    return () => window.api.off('connection:status');
  }, []);
```

- [ ] **Step 4: Build + e2e**

Run: `npm run build && npm run test:e2e`
Expected: ambos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/realtime.ts src/renderer/src/App.tsx
git commit -m "chore: quitar logs de diagnóstico tras estabilizar Realtime"
```

---

## Verificación final manual

Después de Task 14, hacer una prueba humana de extremo a extremo:

1. `npm run dev`
2. En la consola del main debe aparecer `[Realtime] subscribe status= SUBSCRIBED` y luego `[Realtime] Próximo cambio de día en N min`.
3. En la app, panel Comandas: pedidos del día visibles. Marcar uno como LISTO → debe quedarse atenuado al fondo de su columna.
4. Click en "Historial" → carga primera página, agrupada por día, con cabeceras "Ayer" y fechas anteriores.
5. Scroll hasta el fondo: debe aparecer un fetch adicional (verificar en Network de DevTools del renderer o en logs main).
6. (Opcional, requiere intervención de tiempo) cambiar la hora del sistema a las 23:59, esperar a las 00:00. Verificar que el panel cocina/barra se vacía y los pedidos pasan a aparecer en Historial bajo "Ayer".

---

## Notas sobre la columna "✓ HH:MM" en pedidos done

El plan usa `created_at` para mostrar la hora en la etiqueta `✓ HH:MM`, que **no es la hora real en que se marcó done** sino la hora de creación del pedido.

Si esto no es aceptable, hay dos caminos:
1. Añadir columna `done_at TIMESTAMPTZ` en la tabla `orders` (cambio en repo Garum web).
2. Usar `updated_at` si existe en la tabla.

Esa decisión queda **fuera del scope** de este plan y se trata en una iteración posterior.
