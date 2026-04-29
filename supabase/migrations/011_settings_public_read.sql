-- ============================================================
-- GARUM — Migración 011: lectura pública de settings (modo mantenimiento)
-- ============================================================
-- El desktop necesita poder leer `settings.maintenance_enabled` con la
-- anon key para mostrar un banner cuando la web está en mantenimiento.
-- La tabla settings ya era de lectura pública en la migración 004; esta
-- migración solo asegura que sigue así si por algún cambio posterior se
-- hubiera restringido.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'settings' AND policyname = 'public_read_settings'
  ) THEN
    CREATE POLICY "public_read_settings" ON settings FOR SELECT USING (true);
  END IF;
END $$;

-- Realtime para que el desktop reciba el cambio sin necesidad de polling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'settings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE settings';
  END IF;
END $$;
