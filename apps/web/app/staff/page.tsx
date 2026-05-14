"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import { Printer, ChefHat, Wine, LogOut, CheckCircle, Clock } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { filterItems, hasItemsFor, type Destination, type RoutableItem } from "@garum/shared/order-routing";

type OrderItem = RoutableItem & {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type StaffStatus = "pending" | "done" | "na";

type Order = {
  id: string;
  table_number: number;
  total_amount: number;
  created_at: string;
  items: OrderItem[];
  payment_status: "pending" | "paid" | "cancelled";
  staff_status: "pending" | "done";
  staff_status_kitchen: StaffStatus;
  staff_status_bar: StaffStatus;
};

// Devuelve el sub-estado para un destino concreto.
function statusFor(order: Order, dest: Destination): StaffStatus {
  return dest === "cocina" ? order.staff_status_kitchen : order.staff_status_bar;
}

// Formatea tiempo transcurrido desde un timestamp
function useElapsed(created_at: string) {
  const [diffSecs, setDiffSecs] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(created_at).getTime()) / 1000);
      setDiffSecs(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [created_at]);

  let label: string;
  if (diffSecs < 60) label = `${diffSecs}s`;
  else if (diffSecs < 3600) label = `${Math.floor(diffSecs / 60)}min ${diffSecs % 60}s`;
  else label = `${Math.floor(diffSecs / 3600)}h ${Math.floor((diffSecs % 3600) / 60)}min`;

  return { label, diffSecs };
}

// Componente de tarjeta de pedido con contador de tiempo
function OrderCard({
  order,
  dest,
  onDone,
}: {
  order: Order;
  dest: Destination;
  onDone: (id: string, dest: Destination) => void;
}) {
  const { label: elapsed, diffSecs } = useElapsed(order.created_at);
  const filtered = filterItems(order.items, dest);
  const subStatus = statusFor(order, dest);
  const isDone = subStatus === "done";
  const isUrgent = !isDone && diffSecs > 600; // > 10 minutos

  return (
    <div className={`order-card ${isUrgent ? "urgent" : ""} ${isDone ? "done" : ""}`}>
      <div className="card-top">
        <span className="mesa-pill">MESA {order.table_number}</span>
        <div className="time-wrap">
          <Clock size={12} />
          <span className={`time ${isUrgent ? "urgent-time" : ""}`}>{elapsed}</span>
        </div>
      </div>
      <ul className="items-list">
        {filtered.map((item, i) => (
          <li key={i}>
            <span className="qty">{item.quantity}×</span>
            {item.name}
          </li>
        ))}
      </ul>
      <div className="card-actions">
        <button className="print-btn" onClick={() => printTicket(order, dest)}>
          <Printer size={15} /> IMPRIMIR
        </button>
        <button className="done-btn" disabled={isDone} onClick={() => onDone(order.id, dest)}>
          <CheckCircle size={15} /> {isDone ? "LISTO ✓" : "LISTO"}
        </button>
      </div>
    </div>
  );
}

function printTicket(order: Order, dest: Destination) {
  const filtered = filterItems(order.items, dest);
  if (filtered.length === 0) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <html>
      <head>
        <title>GARUM – ${dest.toUpperCase()}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { font-family: monospace; padding: 8px; width: 72mm; font-size: 13px; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
          .title { font-size: 18px; font-weight: bold; }
          .mesa { font-size: 28px; font-weight: 900; margin: 4px 0; }
          .dest { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; }
          .item { display: flex; justify-content: space-between; margin: 3px 0; }
          .qty { font-weight: bold; margin-right: 6px; }
          .time { font-size: 11px; color: #555; text-align: center; margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="header">
          <div class="title">GARUM</div>
          <div class="mesa">MESA ${order.table_number}</div>
          <div class="dest">▸ ${dest}</div>
        </div>
        ${filtered
          .map(
            (i) => `
          <div class="item">
            <span><span class="qty">${i.quantity}x</span>${i.name}</span>
          </div>
        `
          )
          .join("")}
        <div class="time">${new Date(order.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
      </body>
    </html>
  `);
  win.document.close();
}

export default function StaffPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  // Audios diferenciados por destino
  const audioCocinaRef = useRef<HTMLAudioElement | null>(null);
  const audioBarraRef = useRef<HTMLAudioElement | null>(null);

  // Carga pedidos pagados que tengan al menos un destino aún pendiente.
  // No filtramos por staff_status global: aunque el pedido tenga
  // staff_status_kitchen=done, si la barra sigue pending debe aparecer
  // en la columna de barra. La UI atenúa los sub-estados ya servidos.
  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("payment_status", "paid")
      .or("staff_status_kitchen.eq.pending,staff_status_bar.eq.pending")
      .order("created_at", { ascending: false })
      .limit(50);
    setOrders((data ?? []) as Order[]);
  }, []);

  const playArrivalSound = useCallback((order: Order) => {
    const hasCocina = hasItemsFor(order.items ?? [], "cocina");
    const hasBarra = hasItemsFor(order.items ?? [], "barra");
    if (hasCocina) audioCocinaRef.current?.play().catch(() => {});
    if (hasBarra) {
      setTimeout(() => audioBarraRef.current?.play().catch(() => {}), hasCocina ? 600 : 0);
    }
  }, []);

  useEffect(() => {
    // Pre-cargar audios para evitar delay en la primera notificación
    audioCocinaRef.current = new Audio("/notification.mp3");
    audioBarraRef.current = new Audio("/notification.mp3");

    // setState ocurre tras el await dentro de fetchOrders, no de forma síncrona;
    // el linter no puede inferirlo, así que silenciamos la regla aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();

    const channel = supabase
      .channel("staff_orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        if (payload.new.payment_status === "paid") {
          const newOrder = payload.new as Order;
          setOrders((prev) => [newOrder, ...prev]);
          playArrivalSound(newOrder);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const updated = payload.new as Order;
        if (updated.payment_status !== "paid") {
          // Pago cancelado: quitar de la lista si estaba
          setOrders((prev) => prev.filter((o) => o.id !== updated.id));
          return;
        }
        setOrders((prev) => {
          const exists = prev.find((o) => o.id === updated.id);
          // Si los dos destinos están done/na, retirar de la lista
          const fullyDone =
            updated.staff_status_kitchen !== "pending" && updated.staff_status_bar !== "pending";
          if (fullyDone) {
            return prev.filter((o) => o.id !== updated.id);
          }
          return exists ? prev.map((o) => (o.id === updated.id ? updated : o)) : [updated, ...prev];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      audioCocinaRef.current = null;
      audioBarraRef.current = null;
    };
  }, [fetchOrders, playArrivalSound]);

  // Marca como listo SOLO el destino indicado. Si tras el cambio ambos
  // destinos quedan en {done, na}, el trigger en BD pondrá staff_status='done'
  // automáticamente.
  const markDone = async (id: string, dest: Destination) => {
    const column = dest === "cocina" ? "staff_status_kitchen" : "staff_status_bar";

    // Optimistic update con setState funcional para evitar closure stale
    // si el usuario marca dos pedidos casi simultáneamente.
    setOrders((curr) =>
      curr.map((o) => (o.id === id ? { ...o, [column]: "done" as StaffStatus } : o))
    );

    const { error } = await supabase
      .from("orders")
      .update({ [column]: "done" })
      .eq("id", id)
      .eq(column, "pending"); // solo si seguía pending → idempotencia

    if (error) {
      console.error("[Staff] Error marcando como listo:", error.message);
      // Rollback localizado: solo revierte la fila afectada al estado pending,
      // sin pisar otras mutaciones que hayan podido entrar mientras tanto.
      setOrders((curr) =>
        curr.map((o) => (o.id === id ? { ...o, [column]: "pending" as StaffStatus } : o))
      );
      alert("No se pudo marcar como listo. Revisa la conexión y vuelve a intentar.");
    }
  };

  // Una columna muestra los pedidos que tienen items para ese destino
  // y cuyo sub-estado correspondiente sigue pending (los done quedan
  // 1-2 segundos atenuados antes de que la BD los retire del SELECT).
  const col = (dest: Destination) => orders.filter((o) => hasItemsFor(o.items, dest));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/staff/login");
  };

  return (
    <main className="staff-container">
      <header className="staff-header glass">
        <div className="header-left">
          <Image
            src="/Logo%20garum.png"
            alt="Garum Vinoteca"
            className="staff-logo"
            width={48}
            height={48}
            priority
          />
          <span className="header-sub">Panel de Comandas</span>
        </div>
        <div className="header-right">
          <div className="live-badge">
            <div className="pulse-dot" />
            EN VIVO
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="columns">
        {(["cocina", "barra"] as const).map((dest) => (
          <section key={dest} className="column">
            <div className={`column-header ${dest}`}>
              {dest === "cocina" ? <ChefHat size={24} /> : <Wine size={24} />}
              <h2>{dest.toUpperCase()}</h2>
              <span className="badge">{col(dest).length}</span>
            </div>

            <div className="orders-list">
              {col(dest).map((order) => (
                <OrderCard key={order.id + dest} order={order} dest={dest} onDone={markDone} />
              ))}

              {col(dest).length === 0 && <div className="empty-col">Sin pedidos pendientes</div>}
            </div>
          </section>
        ))}
      </div>

      <style jsx>{`
        .staff-container {
          min-height: 100vh;
          background: #0a0a0a;
          color: var(--text);
        }

        .staff-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 10;
          background: #111;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 0.8rem;
        }
        .staff-logo {
          height: 36px;
          width: auto;
          display: block;
        }
        .header-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .live-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.7rem;
          color: #4ade80;
          letter-spacing: 0.1em;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #4ade80;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        .logout-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
          padding: 0.5rem;
          cursor: pointer;
          display: flex;
          transition: all 0.2s;
        }
        .logout-btn:hover {
          border-color: #f87171;
          color: #f87171;
        }

        .columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          padding: 1.5rem;
          min-height: calc(100vh - 70px);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .column-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.2rem;
          border-radius: 12px;
          margin-bottom: 0.5rem;
        }
        .column-header.cocina {
          background: rgba(251, 146, 60, 0.1);
          border: 1px solid rgba(251, 146, 60, 0.3);
          color: #fb923c;
        }
        .column-header.barra {
          background: rgba(212, 175, 55, 0.1);
          border: 1px solid rgba(212, 175, 55, 0.3);
          color: var(--primary);
        }
        .column-header h2 {
          margin: 0;
          font-size: 1rem;
          letter-spacing: 0.1em;
          flex: 1;
        }
        .badge {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 0.15rem 0.6rem;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .orders-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .order-card {
          background: #141414;
          border: 1px solid #222;
          border-radius: 14px;
          padding: 1.2rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          animation: slideIn 0.3s ease;
          transition:
            border-color 0.3s,
            opacity 0.3s;
        }
        .order-card.urgent {
          border-color: rgba(239, 68, 68, 0.5);
          background: #1a0f0f;
        }
        .order-card.done {
          opacity: 0.45;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .mesa-pill {
          background: var(--primary);
          color: #000;
          padding: 0.3rem 0.8rem;
          border-radius: 6px;
          font-weight: 900;
          font-size: 1.1rem;
          letter-spacing: 0.05em;
        }
        .time-wrap {
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }
        .time {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-family: monospace;
        }
        .urgent-time {
          color: #f87171;
          font-weight: 700;
        }

        .items-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-family: monospace;
          font-size: 0.9rem;
          border-top: 1px solid #222;
          padding-top: 0.8rem;
        }
        .qty {
          color: var(--primary);
          font-weight: 700;
          margin-right: 0.4rem;
        }

        .card-actions {
          display: flex;
          gap: 0.6rem;
        }
        .print-btn,
        .done-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.6rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.05em;
        }
        .print-btn {
          background: #1e1e1e;
          border: 1px solid #333;
          color: var(--text-muted);
        }
        .print-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
        }
        .done-btn {
          background: rgba(74, 222, 128, 0.1);
          border: 1px solid rgba(74, 222, 128, 0.3);
          color: #4ade80;
        }
        .done-btn:hover:not(:disabled) {
          background: rgba(74, 222, 128, 0.2);
        }
        .done-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .empty-col {
          text-align: center;
          color: var(--text-muted);
          padding: 3rem 1rem;
          font-size: 0.85rem;
          border: 1px dashed #222;
          border-radius: 12px;
        }

        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(74, 222, 128, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
          }
        }
      `}</style>
    </main>
  );
}
