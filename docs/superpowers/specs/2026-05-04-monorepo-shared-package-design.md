# Spec: Monorepo GARUM con paquete `@garum/shared`

- **Fecha:** 2026-05-04
- **Autor:** Iván González (con asistencia de Claude)
- **Estado:** Aprobado, pendiente de plan de implementación

## 1. Objetivo

Eliminar la duplicación entre `Garum/` (Next.js 16) y `garum-desktop/` (Electron 33), unificándolos en un monorepo gestionado con pnpm workspaces. Crear un paquete `@garum/shared` que sea fuente única de verdad para:

- Lógica de routing cocina/barra (hoy duplicada manualmente).
- Tipos generados desde el esquema Supabase (hoy generados solo en web; desktop los mantiene a mano).
- Tipos de dominio (`Order`, `OrderItem`, `Product`, `Category`).
- Helpers de formateo (moneda EUR, fechas en zona horaria Madrid).
- Constantes de negocio (alérgenos UE 1–14, destinations, payment status).

## 2. Motivación

### Estado actual

- `Garum/lib/order-routing.ts` y `garum-desktop/src/shared/order-routing.ts` son archivos duplicados a mano. Comentarios dentro del desktop indican explícitamente "copiar cambios de la web". Cualquier divergencia desconocida provoca que pedidos se impriman en la estación equivocada.
- `Garum/lib/database.types.ts` se genera con `supabase gen types`. El desktop define tipos a mano en `src/shared/types.ts`. Una migración de columna en Supabase rompe el desktop sin que TypeScript avise.
- Tests unitarios de `order-routing` existen en ambos repos (triple lógica: web, desktop, y la propia tabla de tests). Mantenerlos sincronizados es trabajo manual.

### Beneficios esperados

- Una única fuente de verdad para lógica crítica (routing) y tipos (DB schema).
- Refactors atómicos: renombrar `effectiveDestination()` se propaga a ambas apps en un commit.
- Tests unitarios consolidados; CI bloquea merge si rompen.
- Base sólida para futuros paquetes compartidos (p.ej. cliente Supabase abstraído, validadores Zod).

## 3. Decisiones de diseño

| Decisión            | Opción elegida                           | Alternativa descartada                         | Razón                                                                                              |
| ------------------- | ---------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Estructura de repos | Monorepo pnpm workspaces                 | Repos separados + paquete publicado            | Las apps comparten dominio, DB, ciclo de vida; monorepo permite refactors atómicos                 |
| Alcance del paquete | Mínimo + utilidades cross-cutting        | Solo lo duplicado / cliente Supabase abstraído | Cubre lo que ya se duplica + lo que se duplicará pronto (fechas Madrid); no abstrae prematuramente |
| Build del paquete   | Source-only (`.ts` directo)              | Compilado con `tsc` o `tsup`                   | Consumers son TS-native con bundlers modernos; no se publica a npm; HMR perfecto                   |
| Migración git       | Subtree merge preservando historial      | Empezar de cero                                | `git blame` y log son valiosos a 6 meses; coste one-shot                                           |
| Layout              | `apps/{web,desktop}` + `packages/shared` | `web/`, `desktop/`, `shared/` planos           | Convención estándar pnpm/Turborepo; permite añadir más apps/packages sin reorganizar               |

## 4. Arquitectura

```
GARUM/                           ← repo git único (post-migración)
├── apps/
│   ├── web/                     ← Next.js 16 (antiguo Garum/)
│   └── desktop/                 ← Electron 33 (antiguo garum-desktop/)
├── packages/
│   └── shared/                  ← @garum/shared, source-only TS
├── docs/
│   └── superpowers/specs/       ← este spec y futuros
├── package.json                 ← workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json           ← strict, ES2022, paths
├── .gitignore
└── README.md
```

### Principios

- **Source-only:** el shared exporta `.ts` directos, sin paso de compilación. Web (SWC) y desktop (Vite) los transpilan al consumirlos.
- **Solo lógica pura y tipos:** ningún cliente Supabase, ninguna dependencia nativa, ningún side-effect en el shared.
- **Autonomía operativa por app:** cada app conserva su `.env.local`, su pipeline de deploy, sus tests E2E, sus dependencias específicas.

## 5. Migración (one-shot)

### 5.1 Salvaguardas previas

- Tag `pre-monorepo` en cada repo viejo y push al remoto.
- Branch de migración (`migration/monorepo`) en el monorepo nuevo, revisable antes de mergear a `main`.
- **Vercel:** antes del primer deploy post-migración, configurar **Root Directory = `apps/web`** en project settings.

### 5.2 Pasos

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
git init
git commit --allow-empty -m "chore: initialize monorepo root"

# Subtree merges preservando historial
git subtree add --prefix=apps/web ../Garum main
git subtree add --prefix=apps/desktop ../garum-desktop main

# Limpiar carpetas originales
rm -rf Garum garum-desktop

# Workspace boilerplate (ver §6)
```

### 5.3 Verificación post-migración

- `apps/web/` builda con `pnpm --filter web build`.
- `apps/desktop/` arranca con `pnpm --filter desktop dev`.
- Tests existentes pasan en ambas apps.
- `git log apps/web/lib/order-routing.ts` muestra historial completo del archivo original.

## 6. `packages/shared` — contenido y API

### 6.1 Estructura interna

```
packages/shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 ← barrel principal
│   ├── order-routing.ts         ← lógica cocina/barra
│   ├── database.types.ts        ← generado por supabase gen types (no editar a mano)
│   ├── domain/
│   │   ├── index.ts
│   │   ├── order.ts             ← Order, OrderItem (derivados de Tables<'orders'>)
│   │   ├── product.ts           ← Product, Category
│   │   └── allergens.ts         ← ALLERGENS (UE 1–14)
│   ├── format/
│   │   ├── index.ts
│   │   ├── currency.ts          ← formatEUR(cents)
│   │   └── datetime.ts          ← madridMidnight(), formatMadrid()
│   └── constants/
│       ├── index.ts
│       ├── destinations.ts      ← 'cocina' | 'barra'
│       └── payment-status.ts    ← 'pending' | 'paid' | 'cancelled'
└── tests/
    ├── order-routing.test.ts    ← consolidado desde web + desktop
    ├── format-datetime.test.ts  ← migrado desde desktop (today.test.ts)
    └── format-currency.test.ts  ← nuevo
```

### 6.2 `package.json`

```json
{
  "name": "@garum/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./order-routing": "./src/order-routing.ts",
    "./database": "./src/database.types.ts",
    "./domain": "./src/domain/index.ts",
    "./format": "./src/format/index.ts",
    "./constants": "./src/constants/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

### 6.3 `tsconfig.json` del paquete

Extiende `tsconfig.base.json` del root, sin overrides salvo `include: ["src/**/*", "tests/**/*"]`.

## 7. Cambios en `apps/web`

- `package.json`: añadir `"@garum/shared": "workspace:*"` en `dependencies`.
- `next.config.ts`: añadir `transpilePackages: ["@garum/shared"]`.
- Eliminar `lib/order-routing.ts`; reemplazar imports por `@garum/shared/order-routing`.
- Eliminar `lib/database.types.ts`; reemplazar imports por `@garum/shared/database`.
- Eliminar `tests/unit/order-routing.test.ts` (movido a `packages/shared/tests/`).
- `tsconfig.json`: extiende `../../tsconfig.base.json`; mantiene path alias `@/*` propio.

## 8. Cambios en `apps/desktop`

- `package.json`: añadir `"@garum/shared": "workspace:*"`.
- `electron.vite.config.ts`: validar que main, preload y renderer resuelven `@garum/shared` (electron-vite soporta workspace packages por defecto; añadir alias explícito si surge problema).
- Eliminar `src/shared/order-routing.ts`; reemplazar imports por `@garum/shared/order-routing`.
- `src/shared/types.ts`: mantener **solo** tipos específicos de Electron (canales IPC, `PrinterConfig`, `AppConfig`). Mover `Order`, `OrderItem` a importarse desde `@garum/shared/domain`.
- Eliminar `tests/unit/order-routing.test.ts` y `tests/unit/today.test.ts` (consolidados en shared).
- `tsconfig.web.json` y `tsconfig.node.json`: extender `../../tsconfig.base.json`.

## 9. Tooling root

### 9.1 `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*
```

### 9.2 Root `package.json`

```json
{
  "name": "garum",
  "private": true,
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "db:types": "supabase gen types typescript --project-id vjrttuhdrkljcdixartp > packages/shared/src/database.types.ts",
    "web:dev": "pnpm --filter web dev",
    "desktop:dev": "pnpm --filter desktop dev"
  },
  "devDependencies": {
    "husky": "^9",
    "lint-staged": "^15"
  }
}
```

### 9.3 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 9.4 Husky / lint-staged

Reubicar de `Garum/.husky/` a la raíz. `lint-staged` configurado por carpeta:

- `apps/web/**/*.{ts,tsx}` → eslint web
- `apps/desktop/**/*.{ts,tsx}` → eslint desktop
- `packages/shared/**/*.ts` → eslint shared

## 10. Generación de tipos Supabase

- **Antes:** la web ejecutaba `supabase gen types` y commiteaba `lib/database.types.ts`. Desktop tenía tipos a mano.
- **Después:** `pnpm db:types` en root genera `packages/shared/src/database.types.ts`. Ambas apps lo consumen.
- **Husky pre-commit (V1, no bloqueante):** si hay archivos nuevos en `apps/web/supabase/migrations/`, mostrar warning recordando ejecutar `pnpm db:types`.
- **V2 (futuro, fuera de scope):** workflow CI que ejecute `pnpm db:types` y falle si el output difiere del archivo commiteado.

## 11. CI

`.github/workflows/ci.yml` en root, reemplaza el de la web actual:

```yaml
name: CI
on: [pull_request, push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter web build
```

E2E (Playwright web + Playwright desktop) se mantienen en jobs separados, condicionados por `paths:` para no correr todo en cada PR. El job E2E de desktop no se ejecuta en GitHub Actions sin un runner con display; se ejecuta localmente y eventualmente en un workflow Windows-based.

## 12. Testing

- **Unit (Vitest) en `packages/shared`:** cobertura de `order-routing` (crítico), `format/datetime` (DST/Madrid TZ), `format/currency`.
- CI bloquea merge si los tests del shared fallan, garantizando propagación validada a ambas apps.
- E2E de web y desktop se mantienen en sus apps respectivas — el shared se ejercita indirectamente.

## 13. Riesgos y mitigaciones

| Riesgo                                                 | Mitigación                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Vercel apunta a `Garum/` (raíz repo viejo)             | Configurar Root Directory = `apps/web` antes del merge a main                                |
| `electron-builder` espera estructura de paths concreta | Validar `electron-builder.yml` (resources, output) tras mover; ajustar paths si es necesario |
| Husky en `Garum/.husky/`                               | Reubicar a root; lint-staged consciente de `apps/*` y `packages/*`                           |
| `.env.local` por app                                   | Se mantienen separados (claves distintas); documentar en README root                         |
| Drift accidental durante migración                     | Tag `pre-monorepo` en repos viejos + branch `migration/monorepo` revisable antes de merge    |
| Lockfiles desincronizados                              | Eliminar `package-lock.json` de ambos repos viejos; único `pnpm-lock.yaml` en root           |
| Imports rotos tras refactor                            | `pnpm typecheck` global pasa antes de mergear; tests unitarios cubren `order-routing`        |

## 14. Out of scope

Explícitamente fuera de este spec (pendientes para iteraciones futuras):

- Cliente Supabase abstraído en el shared (decisión: YAGNI; web usa SSR cookies, desktop usa anon key directo).
- Turborepo o Nx (pnpm workspaces sin task cache es suficiente; añadir cache es trivial cuando haga falta).
- Publicación de `@garum/shared` a npm registry.
- Hardening de RLS de Supabase (revisión pendiente, separada).
- Auditoría Stripe (revisión pendiente, separada).
- Auto-update de Electron, firma de código (pendientes, separados).
- Internacionalización del desktop (pendiente, separado).

## 15. Criterios de éxito

La migración se considera exitosa cuando:

1. `pnpm install` en la raíz instala todo el monorepo.
2. `pnpm typecheck` y `pnpm test` pasan en root.
3. `pnpm --filter web build` compila correctamente.
4. `pnpm --filter desktop dev` arranca la app Electron.
5. No quedan archivos `order-routing.ts` ni `database.types.ts` fuera de `packages/shared/`.
6. `git log apps/web/lib/...` y `git log apps/desktop/src/...` muestran historial completo preservado.
7. Vercel deploya `apps/web` correctamente desde la rama de migración.
8. Tests E2E (Playwright) de ambas apps pasan localmente.
