-- ============================================================
-- GARUM — Migración 002: estado de staff en pedidos
-- ============================================================
-- Añade columna staff_status para que el panel de cocina/barra
-- pueda marcar pedidos como completados de forma persistente.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS staff_status TEXT DEFAULT 'pending'
    CHECK (staff_status IN ('pending', 'done'));

-- Índice para filtrar rápidamente pedidos pendientes
CREATE INDEX IF NOT EXISTS idx_orders_staff_status ON orders (staff_status);

-- Habilitar Realtime también para actualizaciones (UPDATE)
-- (INSERT ya estaba habilitado en la migración 001)
