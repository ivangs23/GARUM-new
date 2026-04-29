-- ============================================================
-- GARUM — Migración 008: marca de impresión en pedidos
-- ============================================================
-- El panel de Electron imprime los tickets cuando recibe el evento
-- de Realtime de un pedido recién pagado. Si el desktop estaba cerrado
-- en ese momento, el pedido entraba en cocina pero NUNCA se imprimía.
--
-- Con esta columna el desktop puede recuperar al arrancar todos los
-- pedidos del día con `printed_at IS NULL`, imprimirlos y marcarlos.
-- El UPDATE atómico (`AND printed_at IS NULL`) evita que dos instancias
-- del desktop dupliquen el ticket.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ NULL;

-- Índice parcial para encontrar rápido los no impresos del día
CREATE INDEX IF NOT EXISTS idx_orders_unprinted
  ON orders (created_at)
  WHERE payment_status = 'paid' AND printed_at IS NULL;
