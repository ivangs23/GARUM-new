-- ============================================================
-- GARUM — Migración 009: retirar la tabla `pedidos` (ya no se usa)
-- ============================================================
-- La tabla `pedidos` se creó en la migración 005 para el agente original
-- de impresora. Ese agente fue reemplazado por la app de Electron, que
-- consume directamente la tabla `orders`. Desde entonces nadie lee
-- `pedidos` y el webhook seguía duplicando datos.
--
-- En vez de borrarla, la renombramos a `orders_audit_legacy` para
-- preservar lo histórico (puede haber datos que alguien quiera mirar).
-- Si en una nueva revisión confirmas que no hace falta, basta con
-- DROP TABLE orders_audit_legacy.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pedidos') THEN
    ALTER TABLE pedidos RENAME TO orders_audit_legacy;
  END IF;
END $$;

-- Si algún día decides borrarla, ejecuta:
--   DROP TABLE IF EXISTS orders_audit_legacy;
