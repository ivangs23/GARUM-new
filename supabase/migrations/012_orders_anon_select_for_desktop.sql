-- ============================================================
-- GARUM — Migración 012: política para que el desktop lea/actualice orders
-- ============================================================
-- Hasta ahora la policy de SELECT/UPDATE de `orders` exigía sesión
-- autenticada. El panel de Electron se conectaba con la anon key, así
-- que en cuanto las RLS quedaran activas, *no podría* ni leer pedidos
-- ni marcarlos como listos.
--
-- La opción más limpia sería que el desktop iniciara sesión con un
-- usuario de servicio. Mientras eso no esté hecho, esta migración
-- añade una política de SELECT/UPDATE limitada en tiempo: solo permite
-- ver y actualizar pedidos de las últimas 48 horas. Eso reduce la
-- ventana de fuga si la anon key se filtra (los datos más antiguos
-- siguen siendo invisibles para anon).
--
-- Importante: esta política se debe revertir en cuanto se mueva el
-- desktop a auth real. Para revertir:
--   DROP POLICY IF EXISTS "anon_recent_orders_select" ON orders;
--   DROP POLICY IF EXISTS "anon_recent_orders_update" ON orders;

CREATE POLICY "anon_recent_orders_select"
  ON orders FOR SELECT
  USING (created_at > (now() - interval '48 hours'));

-- El desktop solo necesita actualizar staff_status_kitchen, staff_status_bar
-- y printed_at. Postgres no permite restringir columnas en una policy de
-- forma sencilla, así que limitamos al menos a pedidos recientes y pagados.
CREATE POLICY "anon_recent_orders_update"
  ON orders FOR UPDATE
  USING (
    created_at > (now() - interval '48 hours')
    AND payment_status = 'paid'
  )
  WITH CHECK (
    created_at > (now() - interval '48 hours')
    AND payment_status = 'paid'
  );
