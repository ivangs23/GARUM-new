-- ============================================================
-- GARUM — Migración 003: árbol de categorías recursivo
-- ============================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id UUID NULL
    REFERENCES categories(id) ON DELETE SET NULL;

-- Índice para búsquedas de hijos (WHERE parent_id = ?)
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories (parent_id);

-- Todos los registros existentes tienen parent_id = NULL (raíz) — sin migración de datos necesaria.
