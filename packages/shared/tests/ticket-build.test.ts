import { describe, it, expect } from "vitest";
import { buildTicketLines } from "../src/ticket/build";
import { exampleOrder } from "../src/ticket/example-order";
import type { TicketLine } from "../src/ticket/types";

function texts(lines: TicketLine[]): string[] {
  return lines.flatMap((l) => (l.kind === "text" ? [l.text] : []));
}

describe("buildTicketLines - destination 'all'", () => {
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

describe("buildTicketLines - destination 'cocina'", () => {
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

describe("buildTicketLines - destination 'barra'", () => {
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

describe("buildTicketLines - empty destination case", () => {
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

describe("buildTicketLines - text sanitization", () => {
  // Name contains: cafe with accent (U+00E9), em-dash (U+2014),
  // left curly quote (U+201C), right curly quote (U+201D),
  // horizontal ellipsis (U+2026), wine glass emoji (U+1F377)
  const dirtyName = "Café — “especial” … \u{1F377}";
  const order = {
    ...exampleOrder,
    items: [
      { id: "x", name: dirtyName, price: 3, quantity: 1, destination: "barra" as const },
    ],
  };
  const lines = buildTicketLines(order, "barra");

  it("replaces curly quotes, em-dashes, ellipsis, and emojis", () => {
    const t = texts(lines);
    expect(t).toContain('1x  Cafe - "especial" ... ?');
  });
});

describe("buildTicketLines - pedido footer", () => {
  it("uses last 6 chars of order id uppercased", () => {
    const lines = buildTicketLines(exampleOrder, "all");
    const t = texts(lines);
    expect(t).toContain("Pedido #E-0001");
  });
});
