-- ============================================================
-- GARUM — Migración 010: backfill de items.destination
-- ============================================================
-- Antes de añadir el campo `destination` al carrito, los items se
-- guardaban sin él en `orders.items` (jsonb). El staff los clasificaba
-- por keywords del nombre, lo que hacía que la web y el desktop
-- mostraran el mismo pedido en columnas distintas.
--
-- Esta migración rellena el campo `destination` en todos los items
-- históricos consultando la tabla `categories` a partir del id del
-- producto. Para items que no se consigan resolver (productos
-- borrados) deja el campo a NULL para que el fallback siga aplicando.
--
-- Es idempotente: solo modifica items donde `destination` es NULL o no existe.

WITH product_destinations AS (
  SELECT p.id::text AS product_id, c.destination
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE c.destination IN ('cocina', 'barra')
)
UPDATE orders o SET items = (
  SELECT jsonb_agg(
    CASE
      -- Si ya tiene destination válido, no tocar
      WHEN it->>'destination' IN ('cocina', 'barra') THEN it
      -- Buscar destination según el id del producto (primer segmento antes de '_')
      ELSE jsonb_set(
        it,
        '{destination}',
        to_jsonb((
          SELECT pd.destination
          FROM product_destinations pd
          WHERE pd.product_id = split_part(it->>'id', '_', 1)
        ))
      )
    END
  )
  FROM jsonb_array_elements(o.items) AS it
)
WHERE jsonb_typeof(o.items) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.items) it
    WHERE it->>'destination' IS NULL
       OR it->>'destination' NOT IN ('cocina', 'barra')
  );

-- Después de este backfill, re-disparar el trigger de la migración 007
-- para refrescar staff_status_kitchen / staff_status_bar de los pedidos
-- existentes (por si algún 'na' debería ser 'done' o 'pending').
UPDATE orders SET
  staff_status_kitchen = CASE
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) it
      WHERE it->>'destination' IS NULL OR it->>'destination' = 'cocina'
    )
    THEN CASE WHEN staff_status = 'done' THEN 'done' ELSE staff_status_kitchen END
    ELSE 'na'
  END,
  staff_status_bar = CASE
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) it
      WHERE it->>'destination' = 'barra'
    )
    THEN CASE WHEN staff_status = 'done' THEN 'done' ELSE staff_status_bar END
    ELSE 'na'
  END;
