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
