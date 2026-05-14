# Migrations Garum — orden de aplicación

Las migrations en este directorio se aplican manualmente en el SQL Editor
de Supabase porque el proyecto no usa `supabase db push`. **El orden importa**:
los archivos con número más bajo deben ejecutarse antes que los de número
más alto.

| Archivo                                  | Qué hace                                                                                                          | ¿Aplicada en producción? |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `001_initial_schema.sql`                 | Tablas base, RLS inicial, alérgenos UE.                                                                           | sí                       |
| `002_orders_staff_status.sql`            | Columna `staff_status` global.                                                                                    | sí                       |
| `003_category_tree.sql`                  | `parent_id` en `categories`.                                                                                      | sí                       |
| `004_settings.sql`                       | Tabla `settings` con maintenance_enabled.                                                                         | sí                       |
| `005_pedidos.sql`                        | Tabla `pedidos` (queda renombrada en 009).                                                                        | sí                       |
| `006_wine_fields.sql`                    | Campos de vino + tabla `product_pairings`.                                                                        | sí                       |
| `007_per_destination_status.sql`         | **NUEVO.** `staff_status_kitchen` + `_bar` + trigger derivador.                                                   | **pendiente**            |
| `008_printed_at.sql`                     | **NUEVO.** Columna `printed_at` para anti-duplicación de tickets.                                                 | **pendiente**            |
| `009_drop_pedidos.sql`                   | **NUEVO.** Renombra `pedidos` → `orders_audit_legacy`.                                                            | **pendiente**            |
| `010_backfill_destination.sql`           | **NUEVO.** Rellena `items.destination` en pedidos antiguos.                                                       | **pendiente**            |
| `011_settings_public_read.sql`           | **NUEVO.** Realtime + lectura anon en `settings`.                                                                 | **pendiente**            |
| `012_orders_anon_select_for_desktop.sql` | **NUEVO.** Política RLS limitada a 48h para que el desktop con anon key pueda leer y actualizar `orders`.         | **pendiente**            |
| `013_anon_orders_column_lockdown.sql`    | **NUEVO.** Trigger BEFORE UPDATE que rechaza writes anon a columnas distintas de `staff_status_*` / `printed_at`. | **pendiente**            |

## Despliegue paso a paso

1. **Backup**. En el dashboard de Supabase → Database → Backups, asegúrate
   de que hay un backup reciente. Las migrations de hoy son seguras
   (sólo añaden columnas y políticas), pero hacer backup es barato.

2. **Aplicar 007 → 013 en orden** desde SQL Editor. Cada archivo es
   idempotente: usa `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
   `CREATE POLICY` con guard, etc. Si te paras a la mitad y reintentas,
   no rompes nada.

3. **Comprobar el trigger**. Tras aplicar 007 ejecuta:

   ```sql
   SELECT id, staff_status, staff_status_kitchen, staff_status_bar
     FROM orders ORDER BY created_at DESC LIMIT 5;
   ```

   Los tres campos deben ser coherentes (`staff_status='done'` cuando
   ambos sub-estados están en `done` o `na`).

4. **Comprobar el backfill**. Tras aplicar 010 ejecuta:

   ```sql
   SELECT COUNT(*) FILTER (WHERE EXISTS (
     SELECT 1 FROM jsonb_array_elements(items) it
     WHERE it->>'destination' IS NULL
   )) AS items_sin_destination,
   COUNT(*) AS total
   FROM orders;
   ```

   `items_sin_destination` debería ser muy bajo (solo pedidos cuyos
   productos ya no existen en la tabla `products`).

5. **Despliegue del código** (web + desktop). El código nuevo asume
   las nuevas columnas: si despliegas código antes que migration, el
   panel staff fallará en el query con `or(staff_status_kitchen.eq.pending,…)`.

6. **Rotar secretos**. En `.env.local` (Garum web) había
   `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` y
   `STRIPE_WEBHOOK_SECRET` versionados. Genera nuevos en Stripe / Supabase
   y reemplázalos. La anon key del desktop también estaba hardcoded:
   regenerala si se distribuyó alguna build pública.

7. **Distribuir el desktop nuevo**. La primera vez que el operador
   abra la versión nueva tendrá que ir a _Configuración_ y rellenar
   URL + anon key (a menos que distribuyas con un `.env` que defina
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

## Rollback

Si necesitas revertir las migrations:

```sql
-- 013
DROP TRIGGER IF EXISTS trg_enforce_anon_orders_update ON orders;
DROP FUNCTION IF EXISTS enforce_anon_orders_update_columns();

-- 012
DROP POLICY IF EXISTS "anon_recent_orders_select" ON orders;
DROP POLICY IF EXISTS "anon_recent_orders_update" ON orders;

-- 011: nada destructivo (solo añadió políticas y publication).

-- 010: el backfill no es reversible (no guardamos el estado previo).
-- Los items que se quedaran sin destination siguen funcionando porque
-- el helper compartido hace fallback por keywords.

-- 009
ALTER TABLE orders_audit_legacy RENAME TO pedidos;

-- 008
DROP INDEX IF EXISTS idx_orders_unprinted;
ALTER TABLE orders DROP COLUMN IF EXISTS printed_at;

-- 007
DROP TRIGGER IF EXISTS trg_orders_sync_staff_status ON orders;
DROP FUNCTION IF EXISTS orders_sync_staff_status();
ALTER TABLE orders DROP COLUMN IF EXISTS staff_status_kitchen;
ALTER TABLE orders DROP COLUMN IF EXISTS staff_status_bar;
DROP INDEX IF EXISTS idx_orders_kitchen_status;
DROP INDEX IF EXISTS idx_orders_bar_status;
```

Tras el rollback, el código nuevo no funciona: hay que volver a la
versión anterior de la web y el desktop, o aplicar las migrations de
nuevo cuanto antes.
