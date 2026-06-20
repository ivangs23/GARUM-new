-- ============================================================
-- GARUM — Migración 017: idempotencia de impresión por impresora
-- ============================================================
-- Problema (H4): `printed_at` es un único timestamp que solo se fija cuando
-- TODAS las impresoras imprimen OK. Si una falla (p.ej. barra desconectada),
-- `printed_at` queda NULL y el reintento reimprime a TODAS las impresoras
-- cada ciclo → la que sí funcionaba (cocina) saca un ticket duplicado una y
-- otra vez, mientras la rota nunca se resuelve.
--
-- Solución: `printed_targets` mapea cada impresora (su id de config en el
-- desktop) → timestamp ISO de su impresión OK. El reintento solo manda a las
-- impresoras que NO estén en el mapa. `printed_at` se sigue fijando, pero solo
-- cuando todas las configuradas constan en `printed_targets` (compatibilidad
-- con la lógica existente que usa printed_at como "totalmente impreso").
--
-- Solo escribe el desktop (cuenta de servicio, rol 'desktop'). La política de
-- UPDATE de la migración 014 (paid + role=desktop) ya cubre esta columna; el
-- trigger anti-anon de la 013 no afecta al rol authenticated. No requiere
-- grants adicionales.
--
-- Reversión: alter table public.orders drop column if exists printed_targets;
-- ============================================================

alter table public.orders
  add column if not exists printed_targets jsonb not null default '{}'::jsonb;

comment on column public.orders.printed_targets is
  'Mapa printerId(config desktop) → timestamp ISO de impresiones OK. Permite '
  'reintentar solo las impresoras que fallaron sin duplicar las que ya '
  'imprimieron (H4). printed_at se fija cuando todas las configuradas constan aquí.';
