import { useEffect, useState, type ReactElement } from "react";
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

export function PreviewModal({ order, printers, onClose }: Props): ReactElement {
  const initial = (printers[0]?.destination ?? "all") as TicketDestination;
  const [destination, setDestination] = useState<TicketDestination>(initial);

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
          <button type="button" className="preview-modal__close" onClick={onClose}>
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
              onChange={(e) => setDestination(e.target.value as TicketDestination)}
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
