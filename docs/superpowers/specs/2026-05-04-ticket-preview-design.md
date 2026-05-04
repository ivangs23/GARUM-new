# Spec: Vista previa de ticket en el desktop

- **Fecha:** 2026-05-04
- **Autor:** Iván González (con asistencia de Claude)
- **Estado:** Aprobado, pendiente de plan de implementación

## 1. Objetivo

Permitir al usuario del desktop visualizar en pantalla cómo quedará un ticket impreso, sin enviarlo a la impresora física. Cubre dos casos de uso:

1. **Configurar una impresora** desde Settings: validar que el `destination` (cocina / barra / all) y el formato producen el ticket esperado, usando una orden sintética de ejemplo.
2. **Verificar antes de imprimir** desde Orders: ver para una orden real el ticket exacto que se enviará a una impresora concreta.

Ambos casos comparten el mismo componente de preview y la misma lógica de generación. Esto garantiza que lo que ves en pantalla es exactamente lo que sale por papel (mismo árbol de líneas, mismo filtrado por destino).

## 2. Motivación

- **Coste papel + tiempo:** hoy la única forma de validar el layout es imprimir físicamente. Cada cambio de configuración consume papel térmico y un viaje a la impresora.
- **Confianza de routing:** el filtrado cocina/barra usa keywords y campo `destination` de cada item. Un preview muestra inmediatamente si el ruteo es correcto, antes de que el cliente reciba un ticket equivocado.
- **Onboarding de personal:** mostrar cómo es un ticket facilita explicar el flujo a personal nuevo sin necesidad de la impresora encendida.

## 3. Decisiones de diseño

| Decisión                        | Opción elegida                                        | Alternativa descartada                             | Razón                                                                                 |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Ubicación UI                    | Settings + Orders, mismo componente                   | Solo Settings, o página dedicada                   | (d) cubre ambos casos reales reutilizando un único componente                         |
| Formato visual                  | Papel estilizado (paper-like)                         | Texto monoespaciado plano / render gráfico fiel    | El estilo papel comunica "es un ticket" sin el coste de un simulador ESC/POS completo |
| Fuente de la lógica             | Pure function `buildTicketLines()` en `@garum/shared` | Lógica duplicada en preview vs. printer            | Una sola fuente de verdad evita drift entre lo que se ve y lo que se imprime          |
| Datos del ejemplo (Settings)    | Orden sintética hardcoded en shared                   | Orden mínima en desktop / orden generada aleatoria | Ejemplo estable y suficientemente rico (cocina + barra) facilita validación visual    |
| Selector de impresora en Orders | Dropdown con un preview a la vez                      | Tiles paralelos (uno por impresora)                | V1 minimalista; tiles paralelos quedan como mejora futura                             |

## 4. Arquitectura

```
packages/shared/src/ticket/
├── build.ts                ← buildTicketLines(order, destination) → TicketLine[]
├── example-order.ts        ← exampleOrder: Order (datos sintéticos)
└── types.ts                ← TicketLine, TicketDestination

packages/shared/tests/ticket-build.test.ts
                            ← cubre build de cocina/barra/all + casos vacíos

apps/desktop/src/main/printer/ticket.ts (refactor)
                            ← printOrderTicket() ahora:
                              1. llama buildTicketLines()
                              2. itera TicketLine[] emitiendo comandos ESC/POS

apps/desktop/src/renderer/src/components/TicketPreview.tsx (nuevo)
                            ← <TicketPreview order={...} destination={...} />
                              llama buildTicketLines() y renderiza HTML

apps/desktop/src/renderer/src/components/TicketPreview.css (nuevo)
                            ← estilos del "papel"

apps/desktop/src/renderer/src/pages/Settings.tsx (modificado)
                            ← integra <TicketPreview> con exampleOrder

apps/desktop/src/renderer/src/pages/Orders.tsx (modificado)
                            ← botón "Vista previa" + modal con <TicketPreview>
```

### Principios

- **Una sola fuente de verdad:** `buildTicketLines()` se llama tanto desde el main (printer) como desde el renderer (preview). El árbol de líneas es idéntico en ambos contextos.
- **Pure function:** `buildTicketLines` no tiene side-effects, no toca IO, es trivialmente testeable.
- **Estructura discriminada:** `TicketLine` es un union type por `kind`, lo que permite añadir nuevos tipos de línea (ej. `barcode`, `image`) en el futuro sin romper los consumers existentes.

## 5. Tipos compartidos (`packages/shared/src/ticket/types.ts`)

```ts
import type { Destination } from "../constants/destinations";

export type TicketDestination = Destination | "all";

export type TicketLine =
  | {
      kind: "text";
      text: string;
      align: "left" | "center" | "right";
      bold?: boolean;
      size?: 1 | 2; // 1 = normal, 2 = double-size (alto y ancho)
    }
  | { kind: "divider" }
  | { kind: "newline" }
  | { kind: "cut" };
```

`TicketDestination` extiende `Destination` (`"cocina" | "barra"`) con el valor adicional `"all"` que representa una impresora que imprime todos los items independientemente de su destino.

## 6. Generador `buildTicketLines()`

Firma:

```ts
export function buildTicketLines(
  order: Order,
  destination: TicketDestination,
): TicketLine[];
```

**Comportamiento (mantiene paridad con `printOrderTicket` actual):**

1. Filtra items según `destination`:
   - `"all"` → todos los items.
   - `"cocina"` o `"barra"` → `filterItems(order.items, destination)` (helper existente del shared).

2. Si tras filtrar no quedan items, devuelve un ticket "informativo" mínimo:
   - Header GARUM VINOTECA (centrado, bold, size 2)
   - Divider
   - Texto centrado: `Sin ítems para [destino]`
   - Cut

   (En el printer real, `printOrderTicket` sigue haciendo `return` temprano cuando no hay items — el preview es el único contexto donde tiene sentido mostrar este estado.)

3. Si hay items, devuelve la estructura completa:
   - Header `GARUM VINOTECA` — center, bold, size 2.
   - Divider.
   - Etiqueta `COCINA` / `BARRA` / `TODOS` — center, bold, size 2.
   - `MESA {n}` — left, bold, size 1.
   - `Hora: HH:MM` — left, size 1.
   - Divider.
   - Por cada item: `{quantity}x  {sanitizedName}` — left, size 1.
   - Divider.
   - `Pedido #{XXXXXX}` (últimos 6 chars del id en mayúsculas) — center, size 1.
   - Newline.
   - Cut.

La función `sanitizeForThermal()` actual (replace de comillas curvas, elipsis, emojis) se mueve a `@garum/shared/ticket/build.ts` para que el preview también la aplique. El renderer HTML respetará exactamente el texto saneado, así el preview es fiel byte-a-byte al output del printer.

## 7. Orden de ejemplo (`example-order.ts`)

```ts
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
  created_at: new Date("2026-05-04T13:30:00Z").toISOString(),
};
```

`created_at` fijo (no `new Date()`) para que el preview sea reproducible y los tests deterministas.

## 8. Componente `<TicketPreview>` (renderer)

```tsx
type Props = {
  order: Order;
  destination: TicketDestination;
};

export function TicketPreview({ order, destination }: Props) {
  const lines = buildTicketLines(order, destination);
  return (
    <div
      className="ticket-paper"
      role="img"
      aria-label="Vista previa de ticket"
    >
      <div className="ticket-paper__inner">
        {lines.map((line, i) => renderLine(line, i))}
      </div>
    </div>
  );
}
```

`renderLine()` mapea cada `TicketLine` a JSX:

| Kind            | Render                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `text` (size 1) | `<div>` con `text-align`, `font-weight: bold` si aplica                    |
| `text` (size 2) | `<div>` con `font-size: 22px`, `line-height: 1.2`, `letter-spacing: 0.5px` |
| `divider`       | `<hr className="ticket-paper__divider" />`                                 |
| `newline`       | `<div style={{ height: '0.6em' }} />`                                      |
| `cut`           | `<div className="ticket-paper__cut">✂ - - - - - - - - - - - - -</div>`     |

## 9. Estilos `TicketPreview.css`

```css
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
  position: relative;
}

.ticket-paper::after {
  /* dentado inferior simulando corte */
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -10px;
  height: 12px;
  background: radial-gradient(circle at 6px 0, transparent 6px, #fafafa 6px) 0
    0/12px 12px;
  -webkit-mask: linear-gradient(black 0%, black 100%);
}

.ticket-paper__inner > * {
  white-space: pre;
}

.ticket-paper__divider {
  border: 0;
  border-top: 1px dashed #555;
  margin: 8px 0;
}

.ticket-paper__cut {
  margin-top: 12px;
  color: #888;
  letter-spacing: 1px;
}
```

Diseño cumple los principios de identidad visual del proyecto: paleta neutra para no competir con la app oscura del desktop. El "papel" destaca sobre el fondo `#0a0a0a` por contraste.

## 10. Integración en Settings

Hoy `Settings.tsx` lista las impresoras configuradas con sus controles. La modificación añade:

- A la derecha de cada bloque de impresora (o debajo en pantallas estrechas), un panel "Vista previa" con `<TicketPreview order={exampleOrder} destination={printer.destination} />`.
- El preview se actualiza en vivo cuando cambias `destination` en el dropdown de la impresora (sin necesidad de guardar).
- Hay un toggle "Mostrar vista previa" plegable, para no saturar la pantalla en setups con muchas impresoras.

Layout responsive: en viewport >1100px, preview a la derecha. En menor, debajo.

## 11. Integración en Orders

Hoy `Orders.tsx` muestra las órdenes activas con sus items y un botón "Marcar listo". La modificación añade:

- Botón "Vista previa" en cada tarjeta de orden, al lado de los controles existentes.
- Al pulsarlo abre un modal centrado con:
  - Header: `Vista previa — Pedido #{XXXXXX} — Mesa {n}`.
  - Dropdown "Impresora": opciones pobladas desde `window.api.getConfig().printers`. Por defecto la primera. Cada opción muestra `{label} ({destination})`.
  - `<TicketPreview order={order} destination={selectedPrinter.destination} />` debajo del dropdown.
  - Botón "Cerrar" abajo a la derecha.

El modal NO ofrece "Imprimir desde aquí" en V1 — el printing automático ya ocurre cuando una orden entra en `paid`. El preview es solo informativo / verificación.

Si no hay impresoras configuradas, el botón "Vista previa" sigue funcionando pero el dropdown muestra "Sin impresoras configuradas" y el preview se renderiza con `destination: "all"` por defecto.

## 12. Refactor de `apps/desktop/src/main/printer/ticket.ts`

Reescribir `printOrderTicket()` para que use `buildTicketLines()`:

```ts
export async function printOrderTicket(
  order: Order,
  printerConfig: PrinterConfig,
): Promise<void> {
  const lines = buildTicketLines(
    order,
    printerConfig.destination as TicketDestination,
  );

  // Early return si la única línea es el header de "sin items" — replicar
  // comportamiento actual: no imprimir nada si no hay nada que cocinar/servir.
  const hasItems = lines.some(
    (l) => l.kind === "text" && /^\d+x  /.test(l.text),
  );
  if (!hasItems) return;

  const printer = new ThermalPrinter({
    /* config existente */
  });
  if (!(await printer.isPrinterConnected())) {
    throw new Error(`Impresora no accesible: ${printerConfig.label}`);
  }

  for (const line of lines) {
    emitLine(printer, line);
  }
  await printer.execute();
}

function emitLine(printer: ThermalPrinter, line: TicketLine): void {
  switch (line.kind) {
    case "text":
      if (line.align === "center") printer.alignCenter();
      else if (line.align === "right") printer.alignRight();
      else printer.alignLeft();
      printer.bold(line.bold ?? false);
      if (line.size === 2) printer.setTextSize(1, 1);
      else printer.setTextNormal();
      printer.println(line.text);
      printer.bold(false);
      printer.setTextNormal();
      break;
    case "divider":
      printer.drawLine();
      break;
    case "newline":
      printer.newLine();
      break;
    case "cut":
      printer.cut();
      break;
  }
}
```

Esto mantiene exactamente el output ESC/POS actual (paridad byte-a-byte con la versión pre-refactor) verificado mediante test de regresión opcional.

## 13. Tests

`packages/shared/tests/ticket-build.test.ts` (Vitest, 8–12 casos):

- `'all'` con orden de ejemplo: estructura completa con header, mesa, hora, 4 items, footer, cut.
- `'cocina'` con orden de ejemplo: solo 2 items (cocina), label "COCINA".
- `'barra'` con orden de ejemplo: solo 2 items (barra), label "BARRA".
- `'cocina'` con orden cuyos items son todos de barra: estructura "Sin ítems para cocina".
- Saneo: nombre con `“`, `…`, `–`, emoji → texto saneado en la línea.
- Pedido con id corto (<6 chars): footer no falla.
- Mesa 0 (caso del test print): `MESA 0` aparece.

`apps/desktop` no añade tests E2E para esto en V1 (el preview es UI puro, sin lógica nueva más allá de renderizar `TicketLine[]` que ya está cubierto por los unit tests del shared).

## 14. Out of scope V1

- Logo gráfico en el header del ticket.
- Códigos de barra / QR en el footer (ej. para tracking de pedido).
- Múltiples previews en paralelo (un tile por impresora) en Orders — V1 muestra uno con dropdown.
- Edición del template del ticket desde la UI (la estructura sigue hardcodeada en `build.ts`).
- Botón "Imprimir desde el preview" — V1 es solo lectura.
- Internacionalización del preview (etiquetas "MESA", "Hora", "COCINA"... siguen en español).
- Preview en la web (`apps/web`) — la web hoy no imprime, no necesita preview.

## 15. Criterios de éxito

1. `pnpm --filter @garum/shared test` incluye al menos 8 casos nuevos pasando, todos cubriendo `buildTicketLines`.
2. `pnpm --filter garum-desktop typecheck` sigue verde tras el refactor.
3. `pnpm --filter garum-desktop build` empaqueta correctamente; `apps/desktop/out/main/index.js` sigue conteniendo la lógica de impresión (no se rompió por el refactor).
4. En modo dev (`pnpm desktop:dev`):
   - En Settings, al cambiar `destination` de una impresora, el preview se actualiza en vivo y muestra solo los items correspondientes.
   - En Orders, click en "Vista previa" abre el modal; cambiar la impresora del dropdown actualiza el preview.
5. Un test de regresión opcional (`apps/desktop/tests/unit/ticket-print.test.ts`) confirma que `printOrderTicket` con la orden de ejemplo emite la misma secuencia de comandos ESC/POS que antes del refactor (mock del thermal printer, captura la secuencia de `printer.println`, `printer.bold`, etc.).
