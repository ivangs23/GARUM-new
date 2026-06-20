-- ============================================================
-- GARUM — Migración 016: telemetría remota del desktop
-- ============================================================
-- Permite ver en remoto (panel admin) la salud del cliente Electron
-- mientras esté abierto, sin abrir puertos entrantes: todo es push
-- saliente desde la app usando la cuenta de servicio del desktop
-- (rol 'desktop' del JWT, ver migración 014). NO requiere credenciales
-- nuevas.
--
-- Tres tablas:
--   desktop_heartbeat  → estado vital (upsert cada ~30s por device_id)
--   desktop_logs       → sink de eventos/logs (batched)
--   desktop_commands   → canal on-demand (admin pide, desktop ejecuta)
--
-- Pasos manuales (UNA VEZ, en el SQL Editor de Supabase):
--   1) Ejecutar esta migración completa.
--   2) Verificar que las 3 tablas quedan en la publicación
--      supabase_realtime (el bloque de abajo lo hace de forma idempotente).
--
-- Reversión (emergencia):
--   drop table if exists public.desktop_commands;
--   drop table if exists public.desktop_logs;
--   drop table if exists public.desktop_heartbeat;
-- ============================================================

-- ─── Tablas ───────────────────────────────────────────────────────────────────

create table if not exists public.desktop_heartbeat (
  device_id         text primary key,
  app_version       text,
  connection_status text,
  retry_count       int  not null default 0,
  cache_size        int  not null default 0,
  unprinted_count   int  not null default 0,
  pending_count     int  not null default 0,
  printers          jsonb not null default '[]'::jsonb,
  os                text,
  uptime_s          int,
  updated_at        timestamptz not null default now()
);

create table if not exists public.desktop_logs (
  id         bigint generated always as identity primary key,
  device_id  text not null,
  level      text not null default 'info',  -- debug | info | warn | error
  event      text not null,
  order_id   uuid,
  data       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists desktop_logs_device_created_idx
  on public.desktop_logs (device_id, created_at desc);
create index if not exists desktop_logs_order_idx
  on public.desktop_logs (order_id);
create index if not exists desktop_logs_level_idx
  on public.desktop_logs (level);

create table if not exists public.desktop_commands (
  id           bigint generated always as identity primary key,
  device_id    text not null,
  command      text not null,           -- whitelist: ping|tail_log|dump_cache|dump_config|dump_print_queue
  args         jsonb,
  status       text not null default 'pending',  -- pending | done | error
  result       jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists desktop_commands_device_status_idx
  on public.desktop_commands (device_id, status);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Patrón calcado de la migración 014:
--   · El desktop es 'authenticated' con user_metadata.role = 'desktop'.
--   · El admin/staff es 'authenticated' sin ese rol.
-- El desktop ESCRIBE su telemetría; cualquier autenticado (admin) LEE.

alter table public.desktop_heartbeat enable row level security;
alter table public.desktop_logs      enable row level security;
alter table public.desktop_commands  enable row level security;

-- Heartbeat: el desktop hace upsert (insert + update); el admin lee.
drop policy if exists "desktop_hb_insert" on public.desktop_heartbeat;
create policy "desktop_hb_insert" on public.desktop_heartbeat
  for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop');

drop policy if exists "desktop_hb_update" on public.desktop_heartbeat;
create policy "desktop_hb_update" on public.desktop_heartbeat
  for update to authenticated
  using      ((auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop');

drop policy if exists "admin_hb_select" on public.desktop_heartbeat;
create policy "admin_hb_select" on public.desktop_heartbeat
  for select to authenticated
  using (true);

-- Logs: el desktop inserta; el admin lee.
drop policy if exists "desktop_logs_insert" on public.desktop_logs;
create policy "desktop_logs_insert" on public.desktop_logs
  for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop');

drop policy if exists "admin_logs_select" on public.desktop_logs;
create policy "admin_logs_select" on public.desktop_logs
  for select to authenticated
  using (true);

-- Comandos: el admin inserta y lee; el desktop lee (para recibir) y
-- actualiza (para marcar done/error con el resultado).
drop policy if exists "commands_select" on public.desktop_commands;
create policy "commands_select" on public.desktop_commands
  for select to authenticated
  using (true);

drop policy if exists "admin_commands_insert" on public.desktop_commands;
create policy "admin_commands_insert" on public.desktop_commands
  for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') is distinct from 'desktop');

drop policy if exists "desktop_commands_update" on public.desktop_commands;
create policy "desktop_commands_update" on public.desktop_commands
  for update to authenticated
  using      ((auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'desktop');

-- ─── Realtime publication ─────────────────────────────────────────────────────
-- El desktop se suscribe a desktop_commands (recibir órdenes); el panel
-- admin se suscribe a heartbeat + logs (verlo en vivo). Idempotente: si la
-- tabla ya está en la publicación, ignoramos el error.

do $$
begin
  begin
    alter publication supabase_realtime add table public.desktop_commands;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.desktop_heartbeat;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.desktop_logs;
  exception when duplicate_object then null; end;
end $$;

-- Para que el payload de UPDATE/DELETE incluya la fila completa en Realtime.
alter table public.desktop_commands  replica identity full;
alter table public.desktop_heartbeat replica identity full;

-- ─── Retención (opcional) ─────────────────────────────────────────────────────
-- Si tienes la extensión pg_cron disponible, programa la limpieza de logs y
-- comandos antiguos (14 días). Si no, ejecútalo a mano periódicamente o borra
-- el bloque. Idempotente: ignora el error si pg_cron no está instalado.

do $$
begin
  perform cron.schedule(
    'garum_desktop_logs_retention',
    '17 4 * * *',
    $sql$
      delete from public.desktop_logs    where created_at  < now() - interval '14 days';
      delete from public.desktop_commands where requested_at < now() - interval '14 days';
    $sql$
  );
exception when undefined_function or undefined_table or invalid_schema_name then
  raise notice 'pg_cron no disponible — limpia desktop_logs/desktop_commands manualmente.';
end $$;
