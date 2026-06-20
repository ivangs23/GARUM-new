-- ============================================================
-- GARUM — Migración 018: estado de alertas (dedupe)
-- ============================================================
-- Soporte para el comprobador de alertas (/api/alerts/check). Evita enviar
-- la misma alerta repetidamente: cada incidente se registra con una `key`
-- única y solo se notifica la primera vez que aparece.
--
-- Claves:
--   unprinted:<orderId>  → pedido pagado sin imprimir > umbral (una vez por pedido)
--   offline:<deviceId>   → local sin heartbeat; se BORRA al volver (permite
--                          re-alertar si vuelve a caer y avisar de recuperación)
--
-- Solo la escribe el comprobador con la service_role key (que ignora RLS).
-- ============================================================

create table if not exists public.alert_state (
  key        text primary key,
  kind       text not null,
  ref        text,
  message    text,
  created_at timestamptz not null default now()
);

alter table public.alert_state enable row level security;

-- Lectura para el admin (depurar qué alertas hay activas). El comprobador usa
-- service_role y no necesita policy (la salta). anon no accede.
drop policy if exists "admin_alert_state_select" on public.alert_state;
create policy "admin_alert_state_select" on public.alert_state
  for select to authenticated
  using (true);

-- Retención de registros de dedupe (30 días). Idempotente si no hay pg_cron.
do $$
begin
  perform cron.schedule(
    'garum_alert_state_retention',
    '23 4 * * *',
    $sql$ delete from public.alert_state where created_at < now() - interval '30 days'; $sql$
  );
exception when undefined_function or undefined_table or invalid_schema_name then
  raise notice 'pg_cron no disponible — limpia alert_state manualmente.';
end $$;
