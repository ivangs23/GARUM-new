-- ============================================================
-- GARUM — Migración 007: estado de staff por destino (cocina y barra)
-- ============================================================
-- Hasta ahora `staff_status` era una sola columna para todo el pedido.
-- Eso hacía que cuando cocina marcaba LISTO, también desaparecía la tarjeta
-- de la barra aunque los vinos aún no se hubieran servido.
--
-- A partir de esta migración cada destino tiene su propio estado:
--   - pending : tiene items para ese destino y siguen sin marcarse
--   - done    : tiene items para ese destino y ya se han servido
--   - na      : el pedido no tiene items para ese destino (no aplica)
--
-- La columna `staff_status` original se mantiene como vista derivada
-- para compatibilidad: queda 'done' solo cuando ambos destinos están
-- en {done, na}.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS staff_status_kitchen TEXT NOT NULL DEFAULT 'na'
    CHECK (staff_status_kitchen IN ('pending', 'done', 'na')),
  ADD COLUMN IF NOT EXISTS staff_status_bar TEXT NOT NULL DEFAULT 'na'
    CHECK (staff_status_bar IN ('pending', 'done', 'na'));

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders (staff_status_kitchen);
CREATE INDEX IF NOT EXISTS idx_orders_bar_status     ON orders (staff_status_bar);

-- ── Trigger: derivar staff_status global desde los dos sub-estados ───────────
-- staff_status = 'done' cuando ambos sub-estados están en {done, na}.
-- Cualquier otra combinación se considera 'pending'.
CREATE OR REPLACE FUNCTION orders_sync_staff_status() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.staff_status_kitchen IN ('done', 'na')
     AND NEW.staff_status_bar IN ('done', 'na') THEN
    NEW.staff_status := 'done';
  ELSE
    NEW.staff_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_sync_staff_status ON orders;
CREATE TRIGGER trg_orders_sync_staff_status
  BEFORE INSERT OR UPDATE OF staff_status_kitchen, staff_status_bar ON orders
  FOR EACH ROW
  EXECUTE FUNCTION orders_sync_staff_status();

-- ── Backfill: para los pedidos existentes deducir el estado por destino ──────
-- Si tenían staff_status='done' lo trasladamos a ambos sub-estados (done si
-- había items, na si no). Si seguían pending, marcamos pending donde tocaba.
UPDATE orders SET
  staff_status_kitchen = CASE
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) it
      WHERE it->>'destination' IS NULL OR it->>'destination' = 'cocina'
    )
    THEN CASE WHEN staff_status = 'done' THEN 'done' ELSE 'pending' END
    ELSE 'na'
  END,
  staff_status_bar = CASE
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) it
      WHERE it->>'destination' = 'barra'
    )
    THEN CASE WHEN staff_status = 'done' THEN 'done' ELSE 'pending' END
    ELSE 'na'
  END
WHERE staff_status_kitchen = 'na' AND staff_status_bar = 'na';
