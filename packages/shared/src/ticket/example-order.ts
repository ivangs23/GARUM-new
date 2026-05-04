import type { Order } from "../domain/order";

export const exampleOrder: Order = {
  id: "preview-example-0001",
  table_number: 7,
  items: [
    { id: "ex-1", name: "Croquetas de jamón", price: 8.5, quantity: 2, destination: "cocina" },
    { id: "ex-2", name: "Tortilla española", price: 9.0, quantity: 1, destination: "cocina" },
    { id: "ex-3", name: "Rioja Reserva — copa", price: 4.5, quantity: 2, destination: "barra" },
    { id: "ex-4", name: "Estrella Galicia", price: 3.0, quantity: 1, destination: "barra" },
  ],
  total_amount: 36.5,
  payment_status: "paid",
  staff_status: "pending",
  staff_status_kitchen: "pending",
  staff_status_bar: "pending",
  printed_at: null,
  created_at: "2026-05-04T13:30:00.000Z",
};
