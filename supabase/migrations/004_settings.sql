-- ============================================================
-- GARUM — Migración 004: tabla de configuración global
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Valores por defecto
INSERT INTO settings (key, value) VALUES
  ('maintenance_enabled', 'false'),
  ('maintenance_message', 'Estamos cerrados temporalmente. ¡Volvemos muy pronto!')
ON CONFLICT (key) DO NOTHING;

-- RLS: lectura pública, escritura solo autenticados
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_public_read"
  ON settings FOR SELECT USING (true);

CREATE POLICY "settings_auth_write"
  ON settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
