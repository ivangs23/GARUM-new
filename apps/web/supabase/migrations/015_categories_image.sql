-- Categorías con imagen propia. Fallback al icono emoji si no hay foto.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_url text;

-- Bucket público para portadas de categoría
INSERT INTO storage.buckets (id, name, public)
VALUES ('categories', 'categories', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Categories images public read"   ON storage.objects;
DROP POLICY IF EXISTS "Categories images auth insert"   ON storage.objects;
DROP POLICY IF EXISTS "Categories images auth update"   ON storage.objects;
DROP POLICY IF EXISTS "Categories images auth delete"   ON storage.objects;

CREATE POLICY "Categories images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'categories');

CREATE POLICY "Categories images auth insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'categories' AND auth.role() = 'authenticated');

CREATE POLICY "Categories images auth update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'categories' AND auth.role() = 'authenticated');

CREATE POLICY "Categories images auth delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'categories' AND auth.role() = 'authenticated');
