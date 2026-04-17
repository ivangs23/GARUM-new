-- ============================================================
-- GARUM — Migración 005: tabla pedidos para agente de impresora
-- ============================================================

CREATE TABLE IF NOT EXISTS pedidos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text        NOT NULL,
  order_type   text        NOT NULL,
  table_number text,
  total_amount numeric(10,2),
  status       text        NOT NULL DEFAULT 'paid',
  items        jsonb       NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: solo autenticados pueden leer/escribir
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos_auth_all"
  ON pedidos FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Acceso de servicio (webhook usa service_role key)
CREATE POLICY "pedidos_service_insert"
  ON pedidos FOR INSERT
  WITH CHECK (true);

-- Índice para ordenar por creación
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos (created_at DESC);
