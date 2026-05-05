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
    // Strip combining diacritical marks (accents) so é → e, ñ → n, etc.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/€/g, "€")
    // Collapse surrogate pairs (emoji and other supplementary chars) to a single ?
    .replace(/[\uD800-\uDFFF]{2}/g, "?")
    .replace(/[^\x20-\xff]/g, "?");
}

function formatHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function selectItems(order: Order, destination: TicketDestination): OrderItem[] {
  if (destination === "all") return order.items;
  return filterItems(order.items, destination as Destination);
}

export function buildTicketLines(
  order: Order,
  destination: TicketDestination,
): TicketLine[] {
  const items = selectItems(order, destination);

  const header: TicketLine[] = [
    { kind: "text", text: "GARUM VINOTECA", align: "center", bold: true, size: 2 },
    { kind: "divider" },
  ];

  if (items.length === 0) {
    return [
      ...header,
      { kind: "text", text: `Sin ítems para ${destination}`, align: "center" },
      { kind: "cut" },
    ];
  }

  const idTail = order.id.slice(-6).toUpperCase();

  return [
    ...header,
    { kind: "text", text: DEST_LABELS[destination], align: "center", bold: true, size: 2 },
    { kind: "text", text: `MESA ${order.table_number}`, align: "left", bold: true },
    { kind: "text", text: `Hora: ${formatHHMM(order.created_at)}`, align: "left" },
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
