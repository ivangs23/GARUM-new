import type { ReactElement } from "react";
import { buildTicketLines, type TicketDestination, type TicketLine } from "@garum/shared/ticket";
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

function renderLine(line: TicketLine, index: number): ReactElement {
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

export function TicketPreview({ order, destination }: Props): ReactElement {
  const lines = buildTicketLines(order, destination);
  return (
    <div className="ticket-paper" role="img" aria-label="Vista previa de ticket">
      <div className="ticket-paper__inner">
        {lines.map((line, index) => renderLine(line, index))}
      </div>
    </div>
  );
}
