# Vista previa de ticket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir vista previa visual de tickets en el desktop, integrada en Settings (con orden de ejemplo) y en Orders (con órdenes reales), reusando un único generador de líneas de ticket compartido entre el printer real y el preview.

**Architecture:** Extraer la lógica de "qué se imprime" de `apps/desktop/src/main/printer/ticket.ts` a una función pura `buildTicketLines(order, destination)` en `@garum/shared/ticket`. El printer ESC/POS y un nuevo componente React `<TicketPreview>` consumen el mismo árbol `TicketLine[]`, garantizando paridad byte-a-byte entre lo que se ve y lo que se imprime.

**Tech Stack:** TypeScript 5, Vitest 2, React 19, electron-vite 2, node-thermal-printer 4.6.

**Spec:** `docs/superpowers/specs/2026-05-04-ticket-preview-design.md`

---

## Convención de commits

Conventional Commits (`feat`, `refactor`, `test`, `style`, `docs`).

---

## Task 1: Tipos compartidos `TicketLine` y `TicketDestination`

**Files:**

- Create: `packages/shared/src/ticket/types.ts`

- [ ] **Step 1: Crear el archivo de tipos**

```ts
// packages/shared/src/ticket/types.ts
import type { Destination } from "../constants/destinations";

export type TicketDestination = Destination | "all";

export type TicketLine =
  | {
      kind: "text";
      text: string;
      align: "left" | "center" | "right";
      bold?: boolean;
      size?: 1 | 2;
    }
  | { kind: "divider" }
  | { kind: "newline" }
  | { kind: "cut" };
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm --filter @garum/shared typecheck
```

Expected: PASS sin errores.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ticket/types.ts
git commit -m "feat(shared): add TicketLine and TicketDestination types"
```

---

## Task 2: Orden de ejemplo `exampleOrder`

**Files:**

- Create: `packages/shared/src/ticket/example-order.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// packages/shared/src/ticket/example-order.ts
import type { Order } from "../domain/order";

export const exampleOrder: Order = {
  id: "preview-example-0001",
  table_number: 7,
  items: [
    {
      id: "ex-1",
      name: "Croquetas de jamón",
      price: 8.5,
      quantity: 2,
      destination: "cocina",
    },
    {
      id: "ex-2",
      name: "Tortilla española",
      price: 9.0,
      quantity: 1,
      destination: "cocina",
    },
    {
      id: "ex-3",
      name: "Rioja Reserva — copa",
      price: 4.5,
      quantity: 2,
      destination: "barra",
    },
    {
      id: "ex-4",
      name: "Estrella Galicia",
      price: 3.0,
      quantity: 1,
      destination: "barra",
    },
  ],
  total_amount: 36.5,
  payment_status: "paid",
  staff_status: "pending",
  staff_status_kitchen: "pending",
  staff_status_bar: "pending",
  printed_at: null,
  created_at: "2026-05-04T13:30:00.000Z",
};
```

- [ ] **Step 2: Verificar typecheck**

```bash
pnpm --filter @garum/shared typecheck
```

Expected: PASS. Si falla porque `Order` requiere algún campo adicional que no incluí (ej. `stripe_session_id`), lee `packages/shared/src/domain/order.ts` y añade lo que falte.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ticket/example-order.ts
git commit -m "feat(shared): add exampleOrder fixture for ticket preview"
```

---

## Task 3: `buildTicketLines()` con TDD

**Files:**

- Create: `packages/shared/tests/ticket-build.test.ts`
- Create: `packages/shared/src/ticket/build.ts`

- [ ] **Step 1: Escribir el test (debe fallar)**

```ts
// packages/shared/tests/ticket-build.test.ts
import { describe, it, expect } from "vitest";
import { buildTicketLines } from "../src/ticket/build";
import { exampleOrder } from "../src/ticket/example-order";
import type { TicketLine } from "../src/ticket/types";

function texts(lines: TicketLine[]): string[] {
  return lines.flatMap((l) => (l.kind === "text" ? [l.text] : []));
}

describe("buildTicketLines — destination 'all'", () => {
  const lines = buildTicketLines(exampleOrder, "all");

  it("includes header GARUM VINOTECA centered, bold, size 2", () => {
    const header = lines.find(
      (l) => l.kind === "text" && l.text === "GARUM VINOTECA",
    );
    expect(header).toEqual({
      kind: "text",
      text: "GARUM VINOTECA",
      align: "center",
      bold: true,
      size: 2,
    });
  });

  it("uses label TODOS for destination 'all'", () => {
    expect(texts(lines)).toContain("TODOS");
  });

  it("includes table number and time", () => {
    const t = texts(lines);
    expect(t).toContain("MESA 7");
    expect(t.some((line) => /^Hora: \d{2}:\d{2}$/.test(line))).toBe(true);
  });

  it("includes all 4 items", () => {
    const t = texts(lines);
    expect(t).toContain("2x  Croquetas de jamon");
    expect(t).toContain("1x  Tortilla espanola");
    expect(t).toContain("2x  Rioja Reserva - copa");
    expect(t).toContain("1x  Estrella Galicia");
  });

  it("ends with cut", () => {
    expect(lines.at(-1)).toEqual({ kind: "cut" });
  });
});

describe("buildTicketLines — destination 'cocina'", () => {
  const lines = buildTicketLines(exampleOrder, "cocina");

  it("uses label COCINA", () => {
    expect(texts(lines)).toContain("COCINA");
  });

  it("includes only kitchen items (2)", () => {
    const t = texts(lines);
    expect(t).toContain("2x  Croquetas de jamon");
    expect(t).toContain("1x  Tortilla espanola");
    expect(t).not.toContain("2x  Rioja Reserva - copa");
    expect(t).not.toContain("1x  Estrella Galicia");
  });
});

describe("buildTicketLines — destination 'barra'", () => {
  const lines = buildTicketLines(exampleOrder, "barra");

  it("uses label BARRA", () => {
    expect(texts(lines)).toContain("BARRA");
  });

  it("includes only bar items (2)", () => {
    const t = texts(lines);
    expect(t).toContain("2x  Rioja Reserva - copa");
    expect(t).toContain("1x  Estrella Galicia");
    expect(t).not.toContain("2x  Croquetas de jamon");
  });
});

describe("buildTicketLines — empty destination case", () => {
  const onlyKitchenOrder = {
    ...exampleOrder,
    items: exampleOrder.items.filter((i) => i.destination === "cocina"),
  };
  const lines = buildTicketLines(onlyKitchenOrder, "barra");

  it("returns informative empty ticket with header and message", () => {
    const t = texts(lines);
    expect(t).toContain("GARUM VINOTECA");
    expect(t.some((line) => /Sin .tems para barra/i.test(line))).toBe(true);
  });

  it("ends with cut even when empty", () => {
    expect(lines.at(-1)).toEqual({ kind: "cut" });
  });
});

describe("buildTicketLines — text sanitization", () => {
  const order = {
    ...exampleOrder,
    items: [
      {
        id: "x",
        name: "Café — “especial” … 🍷",
        price: 3,
        quantity: 1,
        destination: "barra" as const,
      },
    ],
  };
  const lines = buildTicketLines(order, "barra");

  it("replaces curly quotes, em-dashes, ellipsis, and emojis", () => {
    const t = texts(lines);
    expect(t).toContain('1x  Cafe - "especial" ... ?');
  });
});

describe("buildTicketLines — pedido footer", () => {
  it("uses last 6 chars of order id uppercased", () => {
    const lines = buildTicketLines(exampleOrder, "all");
    const t = texts(lines);
    // exampleOrder.id = "preview-example-0001" → last 6 = "E-0001" → uppercase "E-0001"
    expect(t).toContain("Pedido #E-0001");
  });
});
```

- [ ] **Step 2: Ejecutar test y verificar que falla**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm --filter @garum/shared test ticket-build
```

Expected: FAIL — `Cannot find module '../src/ticket/build'`.

- [ ] **Step 3: Implementar `build.ts`**

```ts
// packages/shared/src/ticket/build.ts
import type { Order, OrderItem } from "../domain/order";
import { filterItems, type Destination } from "../order-routing";
import type { TicketDestination, TicketLine } from "./types";

const DEST_LABELS: Record<TicketDestination, string> = {
  cocina: "COCINA",
  barra: "BARRA",
  all: "TODOS",
};

export function sanitizeForThermal(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/€/g, "€")
    .replace(/[^\x20-\xff]/g, "?");
}

function formatHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function selectItems(
  order: Order,
  destination: TicketDestination,
): OrderItem[] {
  if (destination === "all") return order.items;
  return filterItems(order.items, destination as Destination);
}

export function buildTicketLines(
  order: Order,
  destination: TicketDestination,
): TicketLine[] {
  const items = selectItems(order, destination);

  const header: TicketLine[] = [
    {
      kind: "text",
      text: "GARUM VINOTECA",
      align: "center",
      bold: true,
      size: 2,
    },
    { kind: "divider" },
  ];

  if (items.length === 0) {
    return [
      ...header,
      { kind: "text", text: `Sin items para ${destination}`, align: "center" },
      { kind: "cut" },
    ];
  }

  const idTail = order.id.slice(-6).toUpperCase();

  return [
    ...header,
    {
      kind: "text",
      text: DEST_LABELS[destination],
      align: "center",
      bold: true,
      size: 2,
    },
    {
      kind: "text",
      text: `MESA ${order.table_number}`,
      align: "left",
      bold: true,
    },
    {
      kind: "text",
      text: `Hora: ${formatHHMM(order.created_at)}`,
      align: "left",
    },
    { kind: "divider" },
    ...items.map<TicketLine>((it) => ({
      kind: "text",
      text: `${it.quantity}x  ${sanitizeForThermal(it.name)}`,
      align: "left",
    })),
    { kind: "divider" },
    { kind: "text", text: `Pedido #${idTail}`, align: "center" },
    { kind: "newline" },
    { kind: "cut" },
  ];
}
```

- [ ] **Step 4: Ejecutar tests y verificar que pasan**

```bash
pnpm --filter @garum/shared test ticket-build
```

Expected: PASS en todos los casos. Si algún assertion falla por whitespace exacto en el item line (los items usan `2 espacios` entre quantity y nombre per spec), revisa el código y los strings esperados se alinean.

- [ ] **Step 5: Verificar tests globales del shared**

```bash
pnpm --filter @garum/shared test
```

Expected: 34+ tests previos siguen pasando, +nuevos tests pasan.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ticket/build.ts packages/shared/tests/ticket-build.test.ts
git commit -m "feat(shared): add buildTicketLines() with TDD coverage"
```

---

## Task 4: Barrel del módulo ticket y export desde el principal

**Files:**

- Create: `packages/shared/src/ticket/index.ts`
- Modify: `packages/shared/package.json` (añadir export subpath)
- Modify: `packages/shared/src/index.ts` (re-export)

- [ ] **Step 1: Crear barrel `packages/shared/src/ticket/index.ts`**

```ts
export * from "./types";
export * from "./build";
export { exampleOrder } from "./example-order";
```

- [ ] **Step 2: Añadir `./ticket` al exports map de `packages/shared/package.json`**

Lee el archivo. En el bloque `"exports"`, añade después del último entry:

```json
"./ticket": "./src/ticket/index.ts"
```

(Mantén las comas correctas en el JSON.)

- [ ] **Step 3: Re-exportar desde el barrel principal `packages/shared/src/index.ts`**

Añade al final del archivo (después de los exports existentes):

```ts
export * from "./ticket";
```

- [ ] **Step 4: pnpm install para refrescar workspace symlinks**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm install --no-frozen-lockfile 2>&1 | tail -5
```

(Si pnpm-lock.yaml no cambia el comando es no-op; si cambia, queda actualizado.)

- [ ] **Step 5: Typecheck global**

```bash
pnpm typecheck
```

Expected: PASS en los 3 paquetes. Si algún test del shared falla por colisión nueva (poco probable porque los exports nuevos son `TicketLine`, `TicketDestination`, `buildTicketLines`, `exampleOrder`, `sanitizeForThermal` — ninguno coincide con exports existentes), reporta el error.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ticket/index.ts packages/shared/package.json packages/shared/src/index.ts pnpm-lock.yaml
git commit -m "feat(shared): expose ticket module via subpath export"
```

---

## Task 5: Refactor de `printOrderTicket()` para usar `buildTicketLines()`

**Files:**

- Modify: `apps/desktop/src/main/printer/ticket.ts`
- Modify: `apps/desktop/tsconfig.node.json` (añadir paths alias para `@garum/shared/ticket`)

- [ ] **Step 1: Añadir paths alias para el subpath nuevo**

Lee `apps/desktop/tsconfig.node.json`. En `compilerOptions.paths`, añade junto a los aliases existentes:

```json
"@garum/shared/ticket": ["../../packages/shared/src/ticket/index.ts"]
```

(Mantén los aliases existentes para `order-routing`, `format`, `domain`. Si alguno no está, déjalo como está.)

- [ ] **Step 2: Reescribir `apps/desktop/src/main/printer/ticket.ts`**

Reemplaza el contenido entero por:

```ts
import {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} from "node-thermal-printer";
import type { Order, PrinterConfig } from "../../shared/types";
import {
  buildTicketLines,
  type TicketDestination,
  type TicketLine,
} from "@garum/shared/ticket";

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
    throw new Error(
      `Impresora no accesible: ${printerConfig.label} (${iface})`,
    );
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
    case "escpos-tcp":
      return `tcp://${config.host ?? "127.0.0.1"}:${config.port ?? 9100}`;
    case "windows":
      return `printer:${config.printerName ?? ""}`;
    default:
      return `tcp://${config.host ?? "127.0.0.1"}:${config.port ?? 9100}`;
  }
}
```

- [ ] **Step 3: Verificar typecheck del desktop**

```bash
pnpm --filter garum-desktop typecheck
```

Expected: PASS. Si falla porque `OrderItem` no se usa (lo eliminamos del import), el linter o tsc avisa — verifica el código y elimina el import sin usar.

- [ ] **Step 4: Verificar build del desktop**

```bash
pnpm --filter garum-desktop build 2>&1 | tail -10
```

Expected: build OK. El bundle main debe seguir incluyendo `buildTicketLines` (porque `excludeDeps: ['@garum/shared']` está activo desde la migración).

- [ ] **Step 5: Verificar que el output ESC/POS contiene los símbolos esperados**

```bash
grep -c "GARUM VINOTECA\|MESA\|Pedido" out/main/index.js
```

Expected: ≥3 (los tres strings aparecen al menos una vez bundleados desde `build.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/printer/ticket.ts apps/desktop/tsconfig.node.json
git commit -m "refactor(desktop): consume buildTicketLines() from @garum/shared in printer"
```

---

## Task 6: Componente `<TicketPreview>` y CSS

**Files:**

- Create: `apps/desktop/src/renderer/src/components/TicketPreview.tsx`
- Create: `apps/desktop/src/renderer/src/components/TicketPreview.css`

- [ ] **Step 1: Crear `TicketPreview.css`**

```css
/* apps/desktop/src/renderer/src/components/TicketPreview.css */
.ticket-paper {
  width: 320px;
  margin: 0 auto;
  background: #fafafa;
  color: #111;
  font-family: "Courier New", ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.4;
  padding: 24px 18px 32px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.12);
  border-radius: 2px;
  position: relative;
}

.ticket-paper__inner > * {
  white-space: pre-wrap;
}

.ticket-paper__line {
  display: block;
}

.ticket-paper__line--center {
  text-align: center;
}

.ticket-paper__line--right {
  text-align: right;
}

.ticket-paper__line--bold {
  font-weight: 700;
}

.ticket-paper__line--big {
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: 0.5px;
}

.ticket-paper__divider {
  border: 0;
  border-top: 1px dashed #555;
  margin: 8px 0;
}

.ticket-paper__newline {
  height: 0.6em;
}

.ticket-paper__cut {
  margin-top: 12px;
  color: #888;
  letter-spacing: 1px;
  text-align: center;
}
```

- [ ] **Step 2: Crear `TicketPreview.tsx`**

```tsx
// apps/desktop/src/renderer/src/components/TicketPreview.tsx
import {
  buildTicketLines,
  type TicketDestination,
  type TicketLine,
} from "@garum/shared/ticket";
import type { Order } from "@garum/shared/domain";
import "./TicketPreview.css";

type Props = {
  order: Order;
  destination: TicketDestination;
};

function lineClass(line: Extract<TicketLine, { kind: "text" }>): string {
  const classes = ["ticket-paper__line"];
  if (line.align === "center") classes.push("ticket-paper__line--center");
  if (line.align === "right") classes.push("ticket-paper__line--right");
  if (line.bold) classes.push("ticket-paper__line--bold");
  if (line.size === 2) classes.push("ticket-paper__line--big");
  return classes.join(" ");
}

function renderLine(line: TicketLine, index: number): JSX.Element {
  switch (line.kind) {
    case "text":
      return (
        <div key={index} className={lineClass(line)}>
          {line.text}
        </div>
      );
    case "divider":
      return <hr key={index} className="ticket-paper__divider" />;
    case "newline":
      return <div key={index} className="ticket-paper__newline" />;
    case "cut":
      return (
        <div key={index} className="ticket-paper__cut">
          ✂ - - - - - - - - - - - - -
        </div>
      );
  }
}

export function TicketPreview({ order, destination }: Props): JSX.Element {
  const lines = buildTicketLines(order, destination);
  return (
    <div
      className="ticket-paper"
      role="img"
      aria-label="Vista previa de ticket"
    >
      <div className="ticket-paper__inner">
        {lines.map((line, index) => renderLine(line, index))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar typecheck**

```bash
pnpm --filter garum-desktop typecheck
```

Expected: PASS. Si falla porque el renderer no resuelve `@garum/shared/ticket` o `@garum/shared/domain`, añade los aliases correspondientes en `apps/desktop/tsconfig.web.json` siguiendo el patrón existente para los otros subpaths.

- [ ] **Step 4: Verificar build del renderer**

```bash
pnpm --filter garum-desktop build 2>&1 | tail -10
```

Expected: build OK. El `out/renderer/` se genera sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/TicketPreview.tsx apps/desktop/src/renderer/src/components/TicketPreview.css apps/desktop/tsconfig.web.json
git commit -m "feat(desktop): add TicketPreview component"
```

---

## Task 7: Integración en Settings

**Files:**

- Modify: `apps/desktop/src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Localizar el componente `PrinterRow` (o equivalente) en Settings**

```bash
grep -n "PrinterRow\|printer.destination\|onUpdate.*destination" apps/desktop/src/renderer/src/pages/Settings.tsx | head -10
```

Anota el nombre exacto del componente que renderiza cada impresora (en línea ~300 según mi exploración previa) y la prop que recibe la `printer: PrinterConfig`.

- [ ] **Step 2: Añadir imports al inicio de `Settings.tsx`**

Edita `apps/desktop/src/renderer/src/pages/Settings.tsx`. Añade junto a los imports existentes:

```tsx
import { TicketPreview } from "../components/TicketPreview";
import { exampleOrder } from "@garum/shared/ticket";
```

- [ ] **Step 3: Añadir state local de "mostrar preview" en el componente PrinterRow**

Localiza el componente que renderiza cada impresora (probablemente `PrinterRow` definido alrededor de línea 320-450 del archivo). Añade dentro del componente, junto a los otros `useState`:

```tsx
const [showPreview, setShowPreview] = useState(false);
```

- [ ] **Step 4: Añadir botón "Vista previa" y panel debajo del bloque de impresora**

Justo antes del cierre del contenedor del PrinterRow (encuentra el último `</div>` del componente que envuelve los controles), añade:

```tsx
<div style={{ marginTop: 12, borderTop: "1px solid #222", paddingTop: 12 }}>
  <button
    type="button"
    style={inputStyle /* o el estilo del botón existente */}
    onClick={() => setShowPreview((v) => !v)}
  >
    {showPreview ? "Ocultar vista previa" : "Vista previa de ticket"}
  </button>
  {showPreview && (
    <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
      <TicketPreview order={exampleOrder} destination={printer.destination} />
    </div>
  )}
</div>
```

(Si `inputStyle` no aplica como estilo de botón, usa el mismo estilo que el botón "Imprimir prueba" del componente — copia su atributo `style`.)

- [ ] **Step 5: Verificar typecheck**

```bash
pnpm --filter garum-desktop typecheck
```

Expected: PASS.

- [ ] **Step 6: Verificar dev runtime manualmente**

```bash
pnpm desktop:dev
```

En la ventana de Electron:

1. Ir a Settings.
2. Crear o editar una impresora.
3. Click en "Vista previa de ticket".
4. Verificar que el preview aparece con la orden de ejemplo (mesa 7, 4 items).
5. Cambiar el dropdown de `destination` entre cocina/barra/all.
6. Verificar que el preview se actualiza:
   - `cocina` → 2 items (croquetas, tortilla), label COCINA.
   - `barra` → 2 items (rioja, cerveza), label BARRA.
   - `all` → 4 items, label TODOS.
7. Cerrar la ventana Electron (Cmd+Q o cerrar X).

Si el preview no aparece o no se actualiza al cambiar destination, revisa que el componente recibe `destination` reactivo (la prop debe leer `printer.destination` directamente, no una copia local en state).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/Settings.tsx
git commit -m "feat(desktop): integrate TicketPreview into Settings printer rows"
```

---

## Task 8: Integración en Orders (modal)

**Files:**

- Modify: `apps/desktop/src/renderer/src/pages/Orders.tsx`
- Create: `apps/desktop/src/renderer/src/components/PreviewModal.tsx`
- Create: `apps/desktop/src/renderer/src/components/PreviewModal.css`

- [ ] **Step 1: Crear `PreviewModal.css`**

```css
.preview-modal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.preview-modal {
  background: #1a1a1a;
  color: #eee;
  border-radius: 6px;
  padding: 20px;
  min-width: 380px;
  max-width: 520px;
  max-height: 92vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}

.preview-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}

.preview-modal__close {
  background: transparent;
  color: #eee;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.preview-modal__field {
  display: block;
  margin-bottom: 16px;
}

.preview-modal__field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-modal__select {
  width: 100%;
  padding: 8px 10px;
  background: #0a0a0a;
  color: #eee;
  border: 1px solid #333;
  border-radius: 4px;
  font-size: 14px;
}

.preview-modal__preview-container {
  display: flex;
  justify-content: center;
}
```

- [ ] **Step 2: Crear `PreviewModal.tsx`**

```tsx
// apps/desktop/src/renderer/src/components/PreviewModal.tsx
import { useEffect, useState } from "react";
import type { PrinterConfig } from "../../../shared/types";
import type { Order } from "@garum/shared/domain";
import type { TicketDestination } from "@garum/shared/ticket";
import { TicketPreview } from "./TicketPreview";
import "./PreviewModal.css";

type Props = {
  order: Order;
  printers: PrinterConfig[];
  onClose: () => void;
};

export function PreviewModal({ order, printers, onClose }: Props): JSX.Element {
  const initial = printers[0]?.destination ?? "all";
  const [destination, setDestination] = useState<TicketDestination>(
    initial as TicketDestination,
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const idTail = order.id.slice(-6).toUpperCase();

  return (
    <div className="preview-modal__backdrop" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal__header">
          <span>
            Vista previa — Pedido #{idTail} — Mesa {order.table_number}
          </span>
          <button
            type="button"
            className="preview-modal__close"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="preview-modal__field">
          <label htmlFor="preview-printer">Impresora</label>
          {printers.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>
              Sin impresoras configuradas — mostrando vista &quot;TODOS&quot;.
            </div>
          ) : (
            <select
              id="preview-printer"
              className="preview-modal__select"
              value={destination}
              onChange={(e) =>
                setDestination(e.target.value as TicketDestination)
              }
            >
              {printers.map((p) => (
                <option key={p.id} value={p.destination}>
                  {p.label} ({p.destination})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="preview-modal__preview-container">
          <TicketPreview order={order} destination={destination} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Inspeccionar `Orders.tsx` para localizar dónde renderiza cada orden**

```bash
grep -n "order\.\|orders\.map\|<button\|markDone" apps/desktop/src/renderer/src/pages/Orders.tsx | head -20
```

Anota:

- Cómo se itera sobre las órdenes (probablemente `orders.map((order) => ...)` o equivalente).
- Dónde está el botón existente "Marcar listo" (referencia para añadir el botón nuevo cerca).
- Cómo se obtiene el listado de printers (probablemente `window.api.getConfig()` cargado en `useEffect`, o vía estado).

- [ ] **Step 4: Añadir state de modal y carga de printers en Orders.tsx**

Edita `apps/desktop/src/renderer/src/pages/Orders.tsx`:

Añade los imports al inicio:

```tsx
import { useEffect, useState } from "react";
import { PreviewModal } from "../components/PreviewModal";
import type { PrinterConfig } from "../../../shared/types";
import type { Order } from "@garum/shared/domain";
```

(Si algunos imports ya existen, no los duplicar.)

En el componente principal de la página (probablemente `Orders` o similar), añade junto a los otros `useState`:

```tsx
const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
const [printers, setPrinters] = useState<PrinterConfig[]>([]);

useEffect(() => {
  window.api.getConfig().then((cfg) => setPrinters(cfg.printers));
}, []);
```

- [ ] **Step 5: Añadir botón "Vista previa" en cada tarjeta de orden**

Localiza el JSX de cada tarjeta de orden (donde está el botón "Marcar listo"). Junto a ese botón, añade:

```tsx
<button
  type="button"
  onClick={() => setPreviewOrder(order)}
  /* mismo estilo que el botón "Marcar listo" o el style inline cercano */
>
  Vista previa
</button>
```

- [ ] **Step 6: Renderizar el modal al final del JSX del componente**

Justo antes del cierre del fragment/`<div>` raíz del componente Orders, añade:

```tsx
{
  previewOrder && (
    <PreviewModal
      order={previewOrder}
      printers={printers}
      onClose={() => setPreviewOrder(null)}
    />
  );
}
```

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter garum-desktop typecheck
```

Expected: PASS.

- [ ] **Step 8: Verificar dev runtime**

```bash
pnpm desktop:dev
```

1. Ir a Orders (o esperar a que aparezca un pedido en cocina/barra).
2. Click en "Vista previa" de cualquier orden.
3. Verificar que abre el modal con:
   - Header con `#XXXXXX` y `Mesa N`.
   - Dropdown con las impresoras configuradas.
   - Preview del ticket con los items reales de esa orden filtrados por el destino de la primera impresora.
4. Cambiar el dropdown a otra impresora con destino distinto.
5. Verificar que el preview se actualiza.
6. Pulsar Escape o click fuera del modal → cierra.
7. Pulsar el botón "Cerrar" → cierra.

Si no hay órdenes activas en el desktop, puedes:

- Insertar una orden de prueba en Supabase desde la web (checkout).
- O extender este test a la fase manual de verificación.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/Orders.tsx apps/desktop/src/renderer/src/components/PreviewModal.tsx apps/desktop/src/renderer/src/components/PreviewModal.css
git commit -m "feat(desktop): add ticket preview modal in Orders page"
```

---

## Task 9: Verificación end-to-end

**Files:** ninguno modificado, solo verificación.

- [ ] **Step 1: Typecheck completo**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm typecheck
```

Expected: PASS en `@garum/shared`, `web`, `garum-desktop`.

- [ ] **Step 2: Tests completos**

```bash
pnpm test
```

Expected: shared con tests previos (34) + nuevos de ticket-build (~12+) pasando. web/desktop sin nuevos tests.

- [ ] **Step 3: Build del desktop**

```bash
pnpm --filter garum-desktop build
```

Expected: main, preload, renderer todos compilan. `out/main/index.js` contiene `buildTicketLines` y `GARUM VINOTECA` bundleados.

- [ ] **Step 4: Verificación visual del preview en Settings**

Arrancar dev:

```bash
pnpm desktop:dev
```

Ejecutar mentalmente este checklist:

- [ ] Settings → mi impresora con destino `cocina` → click "Vista previa" → solo croquetas + tortilla, label COCINA.
- [ ] Cambiar destino a `barra` → solo rioja + estrella, label BARRA.
- [ ] Cambiar destino a `all` → 4 items, label TODOS.
- [ ] Header "GARUM VINOTECA" en tamaño grande, bold, centrado.
- [ ] Mesa 7, hora 15:30 (o lo que dé tu zona horaria a las 13:30 UTC), Pedido #-0001.

- [ ] **Step 5: Verificación visual del preview en Orders**

Si hay órdenes activas:

- [ ] Click "Vista previa" en una orden → modal abre.
- [ ] Dropdown muestra todas las impresoras configuradas.
- [ ] Cambiar impresora actualiza el preview.
- [ ] Escape y click backdrop cierran el modal.

Si no hay órdenes activas, inserta una desde la web:

1. `pnpm web:dev` en otro terminal.
2. Ir a `http://localhost:3001/5` (mesa 5).
3. Añadir items y pagar con tarjeta de prueba Stripe (`4242 4242 4242 4242`).
4. Volver al desktop y verificar que la orden aparece y "Vista previa" funciona.

- [ ] **Step 6: Verificación del paridad printer real (opcional manual)**

Si tienes una impresora térmica accesible:

1. Configurarla en Settings.
2. Click "Imprimir prueba" — debe salir el ticket "Ticket de prueba OK" como antes.
3. Generar una orden real.
4. Verificar que el ticket impreso coincide visualmente con el preview que mostró el desktop.

Si no tienes impresora física, este step se omite y se valida con el smoke test del checkout E2E que ya existe.

- [ ] **Step 7: Commit final si quedan cambios sin commitear**

```bash
git status
```

Si todo está limpio, terminado. Si quedan cambios menores (estilos ajustados durante verificación), commit:

```bash
git add -A
git commit -m "style(desktop): UI polish for ticket preview"
```

---

## Resumen de archivos creados/modificados

### Creados

- `packages/shared/src/ticket/types.ts`
- `packages/shared/src/ticket/build.ts`
- `packages/shared/src/ticket/example-order.ts`
- `packages/shared/src/ticket/index.ts`
- `packages/shared/tests/ticket-build.test.ts`
- `apps/desktop/src/renderer/src/components/TicketPreview.tsx`
- `apps/desktop/src/renderer/src/components/TicketPreview.css`
- `apps/desktop/src/renderer/src/components/PreviewModal.tsx`
- `apps/desktop/src/renderer/src/components/PreviewModal.css`

### Modificados

- `packages/shared/package.json` (exports añadidos)
- `packages/shared/src/index.ts` (re-export de ticket)
- `apps/desktop/src/main/printer/ticket.ts` (refactor a `buildTicketLines`)
- `apps/desktop/tsconfig.node.json` (paths alias para `@garum/shared/ticket`)
- `apps/desktop/tsconfig.web.json` (paths alias si fue necesario)
- `apps/desktop/src/renderer/src/pages/Settings.tsx` (botón + preview por impresora)
- `apps/desktop/src/renderer/src/pages/Orders.tsx` (botón + modal)

---

## Notas para el ejecutor

- **Paridad printer real**: tras Task 5, el output ESC/POS debe ser idéntico al pre-refactor. Si tienes dudas, antes de tocar nada en Task 5, ejecuta una orden de prueba real e imprime; luego replica tras el refactor y compara los dos tickets físicamente. Si hay diferencias, son bugs del refactor.
- **Aliases tsconfig**: el desktop usa dos tsconfigs distintos (`tsconfig.node.json` para main process, `tsconfig.web.json` para renderer). El subpath `@garum/shared/ticket` necesita alias en ambos si se usa en ambos contextos.
- **`buildTicketLines` no toca IO**: es función pura, testeable trivialmente. NO añadas dependencias en main-process en este módulo (como `node-thermal-printer` o `electron`) — eso lo gestiona `apps/desktop/src/main/printer/ticket.ts`.
- **Estilo del preview**: la estética "papel" es deliberada para distinguirlo del fondo oscuro de la app. Si pruebas en una pantalla muy clara y se confunde con el fondo, ajusta el `box-shadow` a algo más pronunciado pero NO cambies a un fondo oscuro — perdería la metáfora "papel".
- **Renderer en Electron**: si en runtime ves un error tipo "Cannot find module '@garum/shared/ticket'" en el renderer, comprueba que electron-vite también incluye el shared en el bundle del renderer (debería por defecto, ya que renderer va por Vite normal). Si hace falta, añade `'@garum/shared'` a los `optimizeDeps.include` del bloque `renderer` en `electron.vite.config.ts`.
