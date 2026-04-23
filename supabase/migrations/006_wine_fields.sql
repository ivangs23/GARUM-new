-- ============================================================
-- GARUM — Migración 006: campos específicos de vino + destacados + maridajes
-- ============================================================

-- Tipo de vino (NULL para productos que no son vino — tapas, café, etc.)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_type TEXT
    CHECK (wine_type IN ('red','white','rose','sparkling','fortified','dessert'));

-- Denominación de origen / región (ej. "Rioja", "Rías Baixas")
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_region TEXT;

-- Variedades de uva (ej. {"Tempranillo","Graciano"})
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_grapes TEXT[] DEFAULT '{}';

-- Añada / cosecha
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_vintage INT
    CHECK (wine_vintage IS NULL OR (wine_vintage BETWEEN 1900 AND 2100));

-- Nota de cata (prosa sensorial corta)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tasting_notes TEXT;

-- Perfil de cata en escala 1–5 (NULL = no aplica)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_body      SMALLINT CHECK (wine_body      BETWEEN 1 AND 5);
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_acidity   SMALLINT CHECK (wine_acidity   BETWEEN 1 AND 5);
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wine_sweetness SMALLINT CHECK (wine_sweetness BETWEEN 1 AND 5);

-- "Recomendado por la casa" → aparece en sección destacada arriba de la carta
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- Maridajes: tabla N:N entre productos (un plato "marida con" varios vinos)
-- Relación asimétrica: (dish_id → wine_id). La UI consulta por dish_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_pairings (
  dish_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  wine_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dish_id, wine_id),
  CHECK (dish_id <> wine_id)
);

CREATE INDEX IF NOT EXISTS idx_pairings_dish ON product_pairings (dish_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pairings_wine ON product_pairings (wine_id);

-- RLS: lectura pública + gestión por auth
ALTER TABLE product_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_pairings"
  ON product_pairings FOR SELECT USING (true);

CREATE POLICY "auth_manage_pairings"
  ON product_pairings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Índice para acelerar "destacados"
CREATE INDEX IF NOT EXISTS idx_products_featured
  ON products (is_featured)
  WHERE is_featured = TRUE;

-- Índice para filtrar por tipo de vino
CREATE INDEX IF NOT EXISTS idx_products_wine_type
  ON products (wine_type)
  WHERE wine_type IS NOT NULL;
