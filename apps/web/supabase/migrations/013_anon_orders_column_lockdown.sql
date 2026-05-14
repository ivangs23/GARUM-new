-- ============================================================
-- GARUM — Migración 013: lock-down de columnas en UPDATE anon de orders
-- ============================================================
-- La política de la migración 012 permite a `anon` actualizar pedidos
-- recientes pagados para que el desktop pueda marcar
-- `staff_status_kitchen`, `staff_status_bar` y `printed_at`. Postgres
-- RLS no admite filtrar por columna, así que un atacante con la anon
-- key podría también pisar `items`, `total_amount` o `payment_status`
-- a través de un PATCH crudo a /rest/v1/orders.
--
-- Este trigger BEFORE UPDATE rechaza la mutación si el rol del caller
-- es `anon` y se intenta cambiar cualquier columna que NO esté en la
-- lista permitida. Es defensa en profundidad por encima de la policy
-- temporal de 012; cuando el desktop migre a auth real, se pueden
-- eliminar tanto este trigger como las policies anon.

CREATE OR REPLACE FUNCTION enforce_anon_orders_update_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role text;
BEGIN
  -- auth.role() devuelve 'anon' para clientes con anon key,
  -- 'authenticated' tras login y 'service_role' desde el service key.
  caller_role := COALESCE(auth.role(), 'anon');

  IF caller_role <> 'anon' THEN
    RETURN NEW;
  END IF;

  -- Cualquier diff en columnas no permitidas → rechazo.
  IF NEW.id                    IS DISTINCT FROM OLD.id
     OR NEW.table_number       IS DISTINCT FROM OLD.table_number
     OR NEW.items              IS DISTINCT FROM OLD.items
     OR NEW.total_amount       IS DISTINCT FROM OLD.total_amount
     OR NEW.payment_status     IS DISTINCT FROM OLD.payment_status
     OR NEW.stripe_session_id  IS DISTINCT FROM OLD.stripe_session_id
     OR NEW.created_at         IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'anon role can only update staff_status_* / printed_at columns on orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_anon_orders_update ON orders;

CREATE TRIGGER trg_enforce_anon_orders_update
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_anon_orders_update_columns();
