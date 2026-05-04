-- ============================================================
-- GARUM VINOTECA — Schema inicial
-- ============================================================

-- Alérgenos (14 oficiales UE)
CREATE TABLE IF NOT EXISTS allergens (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT
);

INSERT INTO allergens (name, icon) VALUES
  ('Gluten',               '🌾'),
  ('Crustáceos',           '🦞'),
  ('Huevos',               '🥚'),
  ('Pescado',              '🐟'),
  ('Cacahuetes',           '🥜'),
  ('Soja',                 '🌱'),
  ('Lácteos',              '🥛'),
  ('Frutos de cáscara',   '🌰'),
  ('Apio',                 '🌿'),
  ('Mostaza',              '🟡'),
  ('Sésamo',               '🌰'),
  ('Dióxido de azufre',   '💨'),
  ('Altramuces',           '🌻'),
  ('Moluscos',             '🐚')
ON CONFLICT DO NOTHING;

-- Categorías de carta
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('cocina', 'barra')),
  icon        TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Productos
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL,
  image_url    TEXT,
  allergen_ids INT[] DEFAULT '{}',
  is_available BOOLEAN DEFAULT TRUE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Extras de producto
CREATE TABLE IF NOT EXISTS product_extras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number     INT NOT NULL,
  items            JSONB NOT NULL DEFAULT '[]',
  total_amount     NUMERIC(10,2),
  payment_status   TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
  stripe_session_id TEXT UNIQUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE allergens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_extras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;

-- Lectura pública (menú visible sin login)
CREATE POLICY "public_read_allergens"      ON allergens      FOR SELECT USING (true);
CREATE POLICY "public_read_categories"     ON categories     FOR SELECT USING (true);
CREATE POLICY "public_read_products"       ON products       FOR SELECT USING (true);
CREATE POLICY "public_read_product_extras" ON product_extras FOR SELECT USING (true);

-- Pedidos: cualquiera inserta (cliente paga), solo auth lee/actualiza
CREATE POLICY "public_insert_orders"       ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "auth_read_orders"           ON orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_update_orders"         ON orders FOR UPDATE USING (auth.role() = 'authenticated');

-- Admin: auth puede gestionar todo el menú
CREATE POLICY "auth_manage_categories"     ON categories     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_manage_products"       ON products       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_manage_product_extras" ON product_extras FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- Realtime para el panel de staff
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ============================================================
-- Storage bucket para imágenes de productos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "public_read_product_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'products');

CREATE POLICY "auth_upload_product_images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');

CREATE POLICY "auth_delete_product_images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'products' AND auth.role() = 'authenticated');
