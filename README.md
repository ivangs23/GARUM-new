# GARUM Vinoteca — Monorepo

Sistema de pedidos en mesa por QR + pago Stripe + panel de comandas en tiempo real.

## Estructura

- `apps/web` — Next.js 16. Carta cliente, admin, panel staff. Despliega en Vercel.
- `apps/desktop` — Electron 33. Cliente físico para cocina/barra con impresión ESC/POS.
- `packages/shared` — Lógica y tipos compartidos (`@garum/shared`).

## Setup

```bash
pnpm install
```

Crear `.env.local` en `apps/web/` y `apps/desktop/` (ver `.env.example` en cada app).

## Comandos

```bash
pnpm web:dev          # Next.js en localhost:3001
pnpm desktop:dev      # Electron en modo dev
pnpm test             # Tests unit en todos los paquetes
pnpm typecheck        # TypeScript strict en todo el repo
pnpm db:types         # Regenerar tipos Supabase en packages/shared
```

## Spec y planes

- `docs/superpowers/specs/` — Documentos de diseño aprobados.
- `docs/superpowers/plans/` — Planes de implementación.
