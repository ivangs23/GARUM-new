-- ============================================================
-- GARUM — Migración 014: cuenta de servicio para el desktop
-- ============================================================
-- Reemplaza el workaround de anon + ventana 48h (migración 012)
-- por autenticación real del desktop con un usuario dedicado.
--
-- Pasos manuales (hacer UNA VEZ en el Dashboard de Supabase):
--   Authentication → Users → "Add user"
--   Email:    desktop@garum.local
--   Password: <contraseña fuerte — guardar en VITE_DESKTOP_PASSWORD>
--   User metadata (JSON): { "role": "desktop" }
--
-- Luego añadir en apps/desktop/.env.local:
--   VITE_DESKTOP_EMAIL=desktop@garum.local
--   VITE_DESKTOP_PASSWORD=<la contraseña>
--
-- Para revertir a anon (emergencia):
--   DROP POLICY IF EXISTS "desktop_service_select" ON orders;
--   DROP POLICY IF EXISTS "desktop_service_update" ON orders;
--   (y volver a activar las policies de migración 012)
-- ============================================================

-- Dar acceso completo de lectura a la cuenta de servicio del desktop
CREATE POLICY "desktop_service_select"
  ON orders FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop'
  );

-- Permitir solo actualizar pedidos pagados (staff_status, printed_at)
CREATE POLICY "desktop_service_update"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop'
    AND payment_status = 'paid'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop'
    AND payment_status = 'paid'
  );

-- Eliminar el workaround anon de migración 012
DROP POLICY IF EXISTS "anon_recent_orders_select" ON orders;
DROP POLICY IF EXISTS "anon_recent_orders_update" ON orders;
