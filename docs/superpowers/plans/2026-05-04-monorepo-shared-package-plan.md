# Monorepo GARUM + `@garum/shared` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar los repos `Garum/` (Next.js) y `garum-desktop/` (Electron) a un monorepo pnpm con un paquete `@garum/shared` que sea fuente única de verdad para `order-routing`, tipos de DB Supabase, tipos de dominio, formateo y constantes.

**Architecture:** Monorepo pnpm workspaces. Estructura `apps/{web,desktop}` + `packages/shared`. El shared es source-only TypeScript (sin build step), consumido vía `transpilePackages` en Next.js y soporte nativo de workspaces en electron-vite. Migración git con subtree merges preservando historial de ambos repos.

**Tech Stack:** pnpm 9, TypeScript 5, Vitest 2, Next.js 16, Electron 33, Vite 5, Supabase JS 2.

**Spec:** `docs/superpowers/specs/2026-05-04-monorepo-shared-package-design.md`

---

## Convenciones de paths

- **Pre-migración** (Tasks 1–3): paths empiezan en `/Users/ivangonzalez/Documents/proyectos/GARUM/` con subcarpetas `Garum/` y `garum-desktop/`.
- **Post-migración** (Tasks 4+): paths usan la nueva estructura `apps/web/`, `apps/desktop/`, `packages/shared/` desde la raíz del monorepo.

## Convención de commits

Conventional Commits, alineado con el historial existente del repo web (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

---

## Task 1: Salvaguardas pre-migración

**Files:**

- Modify: ambos repos viejos (tags + verificación)

- [ ] **Step 1: Verificar que ambos repos están limpios y sincronizados con remoto**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM/Garum
git status
git fetch origin
git log origin/main..HEAD --oneline   # debe estar vacío
```

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM/garum-desktop
git status
git fetch origin
git log origin/main..HEAD --oneline   # debe estar vacío
```

Expected: ambos `git status` muestran "nothing to commit, working tree clean" y los `git log` no muestran commits locales no pusheados. Si hay cambios pendientes, parar y resolverlos antes de continuar.

- [ ] **Step 2: Tag `pre-monorepo` en repo web y push al remoto**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM/Garum
git tag -a pre-monorepo -m "Last commit before monorepo migration"
git push origin pre-monorepo
```

Expected: `git tag` lista `pre-monorepo`. `git push` reporta `* [new tag] pre-monorepo -> pre-monorepo`.

- [ ] **Step 3: Tag `pre-monorepo` en repo desktop y push al remoto**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM/garum-desktop
git tag -a pre-monorepo -m "Last commit before monorepo migration"
git push origin pre-monorepo
```

Expected: igual que Step 2.

- [ ] **Step 4: Backup de archivos no versionados (.env.local) fuera del path de migración**

```bash
mkdir -p /Users/ivangonzalez/garum-migration-backup
cp /Users/ivangonzalez/Documents/proyectos/GARUM/Garum/.env.local \
   /Users/ivangonzalez/garum-migration-backup/web.env.local
cp /Users/ivangonzalez/Documents/proyectos/GARUM/Garum/.env.sentry-build-plugin \
   /Users/ivangonzalez/garum-migration-backup/web.env.sentry-build-plugin
cp /Users/ivangonzalez/Documents/proyectos/GARUM/garum-desktop/.env.local \
   /Users/ivangonzalez/garum-migration-backup/desktop.env.local
ls -la /Users/ivangonzalez/garum-migration-backup/
```

Expected: tres archivos listados con tamaño > 0. Estos archivos NO están en git, hay que restaurarlos manualmente al final.

---

## Task 2: Inicializar monorepo y subtree-merge de ambos repos

**Files:**

- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/.git/` (nuevo repo)
- Move: `Garum/` → `.Garum.old/`, `garum-desktop/` → `.garum-desktop.old/`

- [ ] **Step 1: Mover repos viejos a nombres "ocultos" para no colisionar con `git init`**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
mv Garum .Garum.old
mv garum-desktop .garum-desktop.old
ls -la
```

Expected: `.Garum.old/` y `.garum-desktop.old/` existen; `Garum/` y `garum-desktop/` ya no.

- [ ] **Step 2: Inicializar repo monorepo en raíz**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
rm -f .DS_Store
git init -b main
git commit --allow-empty -m "chore: initialize monorepo root"
git log --oneline
```

Expected: un commit `chore: initialize monorepo root` en branch `main`.

- [ ] **Step 3: Subtree-merge del repo web bajo `apps/web/`**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
git subtree add --prefix=apps/web .Garum.old main
```

Expected: salida termina con `Added dir 'apps/web'`. `ls apps/web/` muestra `app/`, `lib/`, `components/`, `package.json`, etc. `git log apps/web/lib/order-routing.ts --oneline | head` muestra historial real (no un solo commit).

- [ ] **Step 4: Subtree-merge del repo desktop bajo `apps/desktop/`**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
git subtree add --prefix=apps/desktop .garum-desktop.old main
```

Expected: salida termina con `Added dir 'apps/desktop'`. `ls apps/desktop/` muestra `src/`, `package.json`, `electron-builder.yml`, etc.

- [ ] **Step 5: Verificar que tests existentes siguen siendo localizables**

```bash
ls apps/web/tests/unit/order-routing.test.ts
ls apps/desktop/tests/unit/order-routing.test.ts
ls apps/desktop/tests/unit/today.test.ts
ls apps/web/lib/order-routing.ts
ls apps/desktop/src/shared/order-routing.ts
```

Expected: los 5 archivos existen.

---

## Task 3: Workspace boilerplate

**Files:**

- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/pnpm-workspace.yaml`
- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/package.json`
- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/tsconfig.base.json`
- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/.gitignore`
- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/.npmrc`
- Create: `/Users/ivangonzalez/Documents/proyectos/GARUM/README.md`

- [ ] **Step 1: Crear `pnpm-workspace.yaml`**

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 2: Crear `.npmrc` (configuración pnpm para Electron)**

```
node-linker=hoisted
public-hoist-pattern[]=*
shamefully-hoist=true
```

Comentario para humanos (no incluir en archivo): `node-linker=hoisted` y `shamefully-hoist=true` son necesarios para que electron-builder y `node-thermal-printer` resuelvan dependencias nativas correctamente. Sin esto, paquetes Electron rompen.

- [ ] **Step 3: Crear `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Crear `package.json` root**

```json
{
  "name": "garum",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "build": "pnpm -r build",
    "db:types": "supabase gen types typescript --project-id vjrttuhdrkljcdixartp > packages/shared/src/database.types.ts",
    "web:dev": "pnpm --filter web dev",
    "web:build": "pnpm --filter web build",
    "desktop:dev": "pnpm --filter desktop dev"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 5: Crear `.gitignore` root**

```
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
out/
build/
.next/
.turbo/

# Env files
.env
.env.local
.env.*.local
.env.sentry-build-plugin

# Editor / OS
.DS_Store
*.swp
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json

# Logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Test artifacts
coverage/
test-results/
playwright-report/
playwright/.cache/

# TypeScript
*.tsbuildinfo
```

- [ ] **Step 6: Crear `README.md` root**

````markdown
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
````

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

````

- [ ] **Step 7: Mover docs/superpowers de apps/web/docs a docs/ root (estos docs son del monorepo, no de la web)**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
mkdir -p docs
git mv apps/web/docs/superpowers docs/superpowers
ls docs/superpowers/specs/
ls docs/superpowers/plans/
````

Expected: `docs/superpowers/specs/2026-05-04-monorepo-shared-package-design.md` y `docs/superpowers/plans/2026-05-04-monorepo-shared-package-plan.md` (este archivo) listados.

- [ ] **Step 8: Eliminar lockfiles npm de las apps (van a ser sustituidos por pnpm-lock.yaml en root)**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
rm apps/web/package-lock.json
rm apps/desktop/package-lock.json
rm -rf apps/web/node_modules apps/desktop/node_modules
```

Expected: `package-lock.json` ya no existe en ninguna app.

- [ ] **Step 9: Restaurar `.env.local` desde el backup (Task 1, Step 4)**

```bash
cp /Users/ivangonzalez/garum-migration-backup/web.env.local \
   /Users/ivangonzalez/Documents/proyectos/GARUM/apps/web/.env.local
cp /Users/ivangonzalez/garum-migration-backup/web.env.sentry-build-plugin \
   /Users/ivangonzalez/Documents/proyectos/GARUM/apps/web/.env.sentry-build-plugin
cp /Users/ivangonzalez/garum-migration-backup/desktop.env.local \
   /Users/ivangonzalez/Documents/proyectos/GARUM/apps/desktop/.env.local
```

Expected: `apps/web/.env.local` y `apps/desktop/.env.local` existen y contienen las claves originales.

- [ ] **Step 10: pnpm install y verificar resolución de workspaces**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm install
ls node_modules/.pnpm/ | head
ls apps/web/node_modules | head
```

Expected: instalación termina sin error. Hay un único `pnpm-lock.yaml` en root. `apps/web/node_modules` contiene symlinks (`next`, `react`, etc.).

- [ ] **Step 11: Verificar que tests existentes en cada app siguen pasando**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm --filter web exec node --test --experimental-strip-types tests/unit/order-routing.test.ts
pnpm --filter desktop exec vitest run
```

Expected: tests pasan en ambos paquetes. Si falla algo aquí, el problema es el setup de pnpm — no avanzar a tareas siguientes hasta resolverlo.

- [ ] **Step 12: Commit del boilerplate**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore .npmrc README.md pnpm-lock.yaml docs/
git rm apps/web/package-lock.json apps/desktop/package-lock.json
git commit -m "chore: scaffold pnpm workspace at monorepo root"
```

Expected: commit creado. `git status` muestra working tree limpio (excepto `.env.local` que está en .gitignore).

---

## Task 4: Crear paquete `@garum/shared` vacío y enlazarlo a las dos apps

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Modify: `apps/web/package.json` (añadir dep)
- Modify: `apps/desktop/package.json` (añadir dep)
- Modify: `apps/web/next.config.ts` (transpilePackages)

- [ ] **Step 1: Crear `packages/shared/package.json`**

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
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Crear `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Crear `packages/shared/src/index.ts` con barrel inicial vacío**

```ts
export {};
```

- [ ] **Step 4: Añadir `@garum/shared` como dep en `apps/web/package.json`**

Modificar el bloque `"dependencies"` de `apps/web/package.json` añadiendo:

```json
"@garum/shared": "workspace:*"
```

(Mantener orden alfabético dentro del bloque.)

- [ ] **Step 5: Añadir `@garum/shared` como dep en `apps/desktop/package.json`**

Modificar el bloque `"dependencies"` de `apps/desktop/package.json` añadiendo:

```json
"@garum/shared": "workspace:*"
```

- [ ] **Step 6: Configurar `transpilePackages` en `apps/web/next.config.ts`**

Leer el archivo actual y añadir `transpilePackages: ["@garum/shared"]` al objeto config exportado. Si el archivo es:

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  /* opciones existentes */
};
export default nextConfig;
```

Pasa a:

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@garum/shared"],
  /* opciones existentes */
};
export default nextConfig;
```

- [ ] **Step 7: pnpm install para enlazar el workspace package**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm install
ls -la apps/web/node_modules/@garum/shared
ls -la apps/desktop/node_modules/@garum/shared
```

Expected: ambos paths son symlinks a `../../../packages/shared`.

- [ ] **Step 8: Verificar que las apps siguen building tras el cambio**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm --filter web typecheck
pnpm --filter desktop typecheck 2>&1 | tail -20
```

Expected: ambos terminan sin errores. (Aún no usamos nada del shared, solo lo enlazamos.)

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/web/package.json apps/web/next.config.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(shared): scaffold @garum/shared package and link it to web + desktop"
```

---

## Task 5: Migrar `order-routing` al shared con TDD

**Files:**

- Create: `packages/shared/src/order-routing.ts`
- Create: `packages/shared/tests/order-routing.test.ts`
- Read: `apps/web/lib/order-routing.ts` (fuente)
- Read: `apps/web/tests/unit/order-routing.test.ts` (para fusionar)
- Read: `apps/desktop/tests/unit/order-routing.test.ts` (para fusionar)

- [ ] **Step 1: Leer ambos archivos `order-routing.ts` y verificar que son idénticos**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
diff apps/web/lib/order-routing.ts apps/desktop/src/shared/order-routing.ts
```

Expected: salida vacía (archivos idénticos). Si difieren, leer ambos y reconciliar — la versión de la web es la fuente de verdad por convención del spec; documentar cualquier diferencia en el mensaje de commit.

- [ ] **Step 2: Leer ambos test files y verificar diferencias**

```bash
diff apps/web/tests/unit/order-routing.test.ts apps/desktop/tests/unit/order-routing.test.ts
```

Anotar diferencias. La versión consolidada debe contener la unión de casos de prueba.

- [ ] **Step 3: Copiar el código fuente al shared**

```bash
cp apps/web/lib/order-routing.ts packages/shared/src/order-routing.ts
```

- [ ] **Step 4: Escribir test consolidado en `packages/shared/tests/order-routing.test.ts`**

Los dos test files originales (web y desktop) ya existen y se leyeron en Step 2. Crear el archivo nuevo concatenando todos los `describe`/`it` blocks de ambos archivos, ajustando solo:

1. El framework: usar `import { describe, it, expect } from 'vitest';` (la web usaba `node:test` con `--experimental-strip-types`, hay que reescribir los assertions estilo `assert.equal` a `expect(...).toBe(...)` si los hubiera).
2. El path del import: `from '../src/order-routing'`.
3. Eliminar duplicados literales (mismo `it` con mismo título y mismo cuerpo). Si hay duplicado con cuerpos distintos, mantener ambos renombrando el segundo (`'... [desktop]'` y `'... [web]'`).

Ejemplo del header del archivo nuevo:

```ts
import { describe, it, expect } from "vitest";
import { effectiveDestination, BARRA_KEYWORDS } from "../src/order-routing";

// Casos pegados verbatim desde:
// - apps/web/tests/unit/order-routing.test.ts (pre-migración: Garum/tests/unit/order-routing.test.ts)
// - apps/desktop/tests/unit/order-routing.test.ts (pre-migración: garum-desktop/tests/unit/order-routing.test.ts)

describe("effectiveDestination", () => {
  // ← pegar todos los `it` de la sección equivalente en ambos archivos
});

describe("BARRA_KEYWORDS", () => {
  // ← pegar todos los `it` de la sección equivalente en ambos archivos
});
```

No inventar casos nuevos. La regla es: un test que pasaba antes debe seguir pasando.

- [ ] **Step 5: Ejecutar test y verificar que pasa**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm --filter @garum/shared test
```

Expected: todos los tests del shared pasan. Si falla, el código copiado no soporta uno de los casos de prueba — investigar y corregir antes de continuar.

- [ ] **Step 6: Reemplazar imports en web**

```bash
grep -rn "from '@/lib/order-routing'" apps/web/
grep -rn "from '../lib/order-routing'" apps/web/
grep -rn "from './order-routing'" apps/web/
```

Para cada hit, editar el archivo y cambiar el import a:

```ts
import { effectiveDestination, BARRA_KEYWORDS } from "@garum/shared/order-routing";
```

(Ajustar el grupo de exports importados según lo que cada archivo use.)

- [ ] **Step 7: Reemplazar imports en desktop**

```bash
grep -rn "from '\.\./shared/order-routing'" apps/desktop/src/
grep -rn "from '\./order-routing'" apps/desktop/src/
grep -rn "from '@shared/order-routing'" apps/desktop/src/
```

Para cada hit, cambiar el import a `from '@garum/shared/order-routing'`.

- [ ] **Step 8: Eliminar archivos duplicados**

```bash
rm apps/web/lib/order-routing.ts
rm apps/desktop/src/shared/order-routing.ts
rm apps/web/tests/unit/order-routing.test.ts
rm apps/desktop/tests/unit/order-routing.test.ts
```

- [ ] **Step 9: Verificar typecheck en ambas apps y test del shared**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm typecheck
pnpm test
```

Expected: typecheck y tests pasan en los tres paquetes.

- [ ] **Step 10: Commit**

```bash
git add packages/shared apps/web apps/desktop
git commit -m "refactor: move order-routing logic to @garum/shared"
```

---

## Task 6: Migrar `database.types.ts` al shared

**Files:**

- Create: `packages/shared/src/database.types.ts`
- Delete: `apps/web/lib/database.types.ts`

- [ ] **Step 1: Mover el archivo de tipos generados al shared**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
git mv apps/web/lib/database.types.ts packages/shared/src/database.types.ts
```

- [ ] **Step 2: Reemplazar imports en web**

```bash
grep -rn "from '@/lib/database.types'" apps/web/
grep -rn "from '../lib/database.types'" apps/web/
grep -rn "from './database.types'" apps/web/
```

Para cada hit, cambiar:

```ts
import type { Database } from "@/lib/database.types";
// ↓
import type { Database } from "@garum/shared/database";
```

(Aplicar el mismo cambio para imports de `Tables`, `Json`, etc. desde el mismo módulo.)

- [ ] **Step 3: Verificar typecheck en web**

```bash
pnpm --filter web typecheck
```

Expected: pasa sin errores.

- [ ] **Step 4: Actualizar script `db:types` en root package.json (ya apunta al shared, validar)**

Verificar que `package.json` root tiene:

```json
"db:types": "supabase gen types typescript --project-id vjrttuhdrkljcdixartp > packages/shared/src/database.types.ts"
```

Si no, editarlo a esta forma. Esto fue creado en Task 3 Step 4; este step es solo verificación.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web
git commit -m "refactor: move Supabase database types to @garum/shared"
```

---

## Task 7: Crear módulo `format/currency` con TDD

**Files:**

- Create: `packages/shared/src/format/currency.ts`
- Create: `packages/shared/tests/format-currency.test.ts`
- Create: `packages/shared/src/format/index.ts`

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/format-currency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatEUR } from "../src/format/currency";

describe("formatEUR", () => {
  it("formats integer euros with two decimals", () => {
    expect(formatEUR(10)).toBe("10,00 €");
  });

  it("formats decimal amounts with comma separator", () => {
    expect(formatEUR(12.5)).toBe("12,50 €");
  });

  it("formats large amounts with thousands separator", () => {
    expect(formatEUR(1234.56)).toBe("1.234,56 €");
  });

  it("formats zero", () => {
    expect(formatEUR(0)).toBe("0,00 €");
  });

  it("handles negative amounts", () => {
    expect(formatEUR(-5)).toBe("-5,00 €");
  });
});
```

- [ ] **Step 2: Ejecutar test y verificar que falla**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm --filter @garum/shared test
```

Expected: FAIL — `Cannot find module '../src/format/currency'`.

- [ ] **Step 3: Escribir implementación mínima**

`packages/shared/src/format/currency.ts`:

```ts
const formatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(amount: number): string {
  return formatter.format(amount);
}
```

- [ ] **Step 4: Crear barrel `packages/shared/src/format/index.ts`**

```ts
export * from "./currency";
```

- [ ] **Step 5: Ejecutar test y verificar que pasa**

```bash
pnpm --filter @garum/shared test
```

Expected: PASS. Si falla por diferencias de espacio no-rompible (` ` vs ` `) en la salida de `Intl.NumberFormat`, ajustar los assertions del test usando `.normalize()` o el carácter correcto que devuelve la API.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add formatEUR currency formatter"
```

---

## Task 8: Crear módulo `format/datetime` con TDD (consolida `today.test.ts` del desktop)

**Files:**

- Create: `packages/shared/src/format/datetime.ts`
- Create: `packages/shared/tests/format-datetime.test.ts`
- Modify: `packages/shared/src/format/index.ts`
- Read: `apps/desktop/tests/unit/today.test.ts` (para fusionar casos)
- Read: implementación actual de "today" en `apps/desktop/src/main/realtime.ts` o donde viva

- [ ] **Step 1: Identificar la función `today()` actual en el desktop**

```bash
grep -rn "function today\|const today =\|export.*today" apps/desktop/src/
cat apps/desktop/tests/unit/today.test.ts
```

Anotar la firma actual (parámetros, retorno) y los casos de prueba cubiertos.

- [ ] **Step 2: Escribir tests consolidados (incluyendo casos del desktop + edge cases DST)**

`packages/shared/tests/format-datetime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { madridMidnightISO, isSameMadridDay } from "../src/format/datetime";

describe("madridMidnightISO", () => {
  it("returns ISO timestamp at Madrid midnight for given Date", () => {
    // 4 de mayo 2026, 14:30 UTC = 16:30 Madrid (CEST, UTC+2)
    const date = new Date("2026-05-04T14:30:00Z");
    const result = madridMidnightISO(date);
    // Madrid midnight 2026-05-04 = 2026-05-03T22:00:00Z (CEST)
    expect(result).toBe("2026-05-03T22:00:00.000Z");
  });

  it("handles winter timezone (CET, UTC+1)", () => {
    // 15 de enero 2026, 12:00 UTC = 13:00 Madrid (CET)
    const date = new Date("2026-01-15T12:00:00Z");
    const result = madridMidnightISO(date);
    // Madrid midnight 2026-01-15 = 2026-01-14T23:00:00Z (CET)
    expect(result).toBe("2026-01-14T23:00:00.000Z");
  });

  it("handles DST transition day (last Sunday of March)", () => {
    // 29 de marzo 2026 es la transición CET → CEST
    const date = new Date("2026-03-29T12:00:00Z");
    const result = madridMidnightISO(date);
    // Madrid midnight 2026-03-29 = 2026-03-28T23:00:00Z (todavía CET hasta las 02:00 local)
    expect(result).toBe("2026-03-28T23:00:00.000Z");
  });
});

describe("isSameMadridDay", () => {
  it("returns true for two timestamps in the same Madrid day", () => {
    const a = new Date("2026-05-04T08:00:00Z"); // 10:00 Madrid
    const b = new Date("2026-05-04T20:00:00Z"); // 22:00 Madrid
    expect(isSameMadridDay(a, b)).toBe(true);
  });

  it("returns false when timestamps cross Madrid midnight", () => {
    const a = new Date("2026-05-04T20:00:00Z"); // 22:00 Madrid 4-may
    const b = new Date("2026-05-04T23:00:00Z"); // 01:00 Madrid 5-may
    expect(isSameMadridDay(a, b)).toBe(false);
  });
});
```

(Añadir cualquier caso adicional que existiese en `apps/desktop/tests/unit/today.test.ts`.)

- [ ] **Step 3: Ejecutar test y verificar que falla**

```bash
pnpm --filter @garum/shared test format-datetime
```

Expected: FAIL — módulo no existe.

- [ ] **Step 4: Implementar `packages/shared/src/format/datetime.ts`**

```ts
const MADRID_TZ = "Europe/Madrid";

function madridDateParts(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

export function madridMidnightISO(date: Date): string {
  const { year, month, day } = madridDateParts(date);
  const localMidnightISO = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`;

  const probe = new Date(`${localMidnightISO}Z`);
  const probeParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const probeHourStr = probeParts.find((p) => p.type === "hour")?.value ?? "0";
  const probeHour = Number(probeHourStr);
  const offsetHours = probeHour === 0 ? 0 : 24 - probeHour;

  return new Date(`${localMidnightISO}Z`)
    .toISOString()
    .replace(/T\d{2}:/, `T${String(offsetHours).padStart(2, "0")}:`);
}

export function isSameMadridDay(a: Date, b: Date): boolean {
  const aParts = madridDateParts(a);
  const bParts = madridDateParts(b);
  return aParts.year === bParts.year && aParts.month === bParts.month && aParts.day === bParts.day;
}
```

(Si la implementación actual del desktop ya resuelve esto correctamente, copiarla en lugar de la versión de arriba — preferir código probado en producción. La versión de arriba es punto de partida si no hay implementación reutilizable.)

- [ ] **Step 5: Actualizar barrel `packages/shared/src/format/index.ts`**

```ts
export * from "./currency";
export * from "./datetime";
```

- [ ] **Step 6: Ejecutar tests y verificar que pasan**

```bash
pnpm --filter @garum/shared test
```

Expected: PASS en ambos archivos de test.

- [ ] **Step 7: Reemplazar uso en desktop**

Identificar dónde `apps/desktop/src/main/realtime.ts` (o similar) usa la función `today()` antigua y sustituir por imports desde `@garum/shared/format`. Eliminar la implementación duplicada del desktop.

```bash
grep -rn "function today\|const today" apps/desktop/src/
```

Para cada uso, sustituir por `madridMidnightISO(new Date())` o `isSameMadridDay(...)` según corresponda. Eliminar la función original tras confirmar que no quedan llamadas.

- [ ] **Step 8: Eliminar el test viejo del desktop**

```bash
rm apps/desktop/tests/unit/today.test.ts
```

- [ ] **Step 9: Verificar typecheck y tests globales**

```bash
pnpm typecheck
pnpm test
```

Expected: todo pasa.

- [ ] **Step 10: Commit**

```bash
git add packages/shared apps/desktop
git commit -m "feat(shared): add Madrid timezone datetime helpers and consolidate from desktop"
```

---

## Task 9: Crear módulo `constants` (destinations, payment-status, allergens)

**Files:**

- Create: `packages/shared/src/constants/destinations.ts`
- Create: `packages/shared/src/constants/payment-status.ts`
- Create: `packages/shared/src/constants/allergens.ts`
- Create: `packages/shared/src/constants/index.ts`

- [ ] **Step 1: Escribir `destinations.ts`**

```ts
export const DESTINATIONS = ["cocina", "barra"] as const;
export type Destination = (typeof DESTINATIONS)[number];
```

- [ ] **Step 2: Escribir `payment-status.ts`**

```ts
export const PAYMENT_STATUSES = ["pending", "paid", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
```

- [ ] **Step 3: Escribir `allergens.ts` (UE 1–14)**

```ts
export const ALLERGENS = [
  { id: 1, key: "gluten", label_es: "Gluten" },
  { id: 2, key: "crustaceans", label_es: "Crustáceos" },
  { id: 3, key: "eggs", label_es: "Huevos" },
  { id: 4, key: "fish", label_es: "Pescado" },
  { id: 5, key: "peanuts", label_es: "Cacahuetes" },
  { id: 6, key: "soy", label_es: "Soja" },
  { id: 7, key: "milk", label_es: "Leche (lactosa)" },
  { id: 8, key: "nuts", label_es: "Frutos de cáscara" },
  { id: 9, key: "celery", label_es: "Apio" },
  { id: 10, key: "mustard", label_es: "Mostaza" },
  { id: 11, key: "sesame", label_es: "Sésamo" },
  { id: 12, key: "sulphites", label_es: "Sulfitos" },
  { id: 13, key: "lupin", label_es: "Altramuces" },
  { id: 14, key: "molluscs", label_es: "Moluscos" },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]["id"];
export type AllergenKey = (typeof ALLERGENS)[number]["key"];
```

- [ ] **Step 4: Crear barrel `constants/index.ts`**

```ts
export * from "./destinations";
export * from "./payment-status";
export * from "./allergens";
```

- [ ] **Step 5: Ejecutar typecheck**

```bash
pnpm --filter @garum/shared typecheck
```

Expected: pasa sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants
git commit -m "feat(shared): add destinations, payment-status, and allergens constants"
```

---

## Task 10: Crear módulo `domain` (Order, OrderItem, Product, Category)

**Files:**

- Create: `packages/shared/src/domain/order.ts`
- Create: `packages/shared/src/domain/product.ts`
- Create: `packages/shared/src/domain/index.ts`
- Read: `apps/desktop/src/shared/types.ts` (para identificar tipos a migrar)

- [ ] **Step 1: Leer tipos actuales del desktop**

```bash
cat apps/desktop/src/shared/types.ts
```

Identificar definiciones de `Order`, `OrderItem`, `Product`, `Category`. Anotar campos.

- [ ] **Step 2: Identificar la forma real de `OrderItem` (JSONB `items` en tabla orders)**

```bash
grep -n "OrderItem\|items:" apps/desktop/src/shared/types.ts
grep -rn "OrderItem" apps/web/lib apps/web/components apps/web/app/api
grep -n "items" apps/web/app/api/checkout/route.ts
```

Leer las definiciones encontradas. Anotar los campos reales del item: `id`, `name`, `price`, `quantity`, y cualquier otro (extras, modifiers, special_instructions). La definición canónica debe coincidir con lo que la web inserta en `orders.items` y lo que el desktop lee.

- [ ] **Step 3: Escribir `domain/order.ts` derivando del schema Supabase**

Usar los campos reales identificados en Step 2. Plantilla base (ajustar `OrderItem` a la realidad observada):

```ts
import type { Database } from "../database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  // ← añadir aquí los campos extra encontrados en Step 2
}

export interface Order extends Omit<OrderRow, "items"> {
  items: OrderItem[];
}
```

Si la tabla `orders.items` ya tiene un tipo `Json` en el schema generado, este wrapper sirve para refinarlo a `OrderItem[]` en TypeScript.

- [ ] **Step 4: Escribir `domain/product.ts`**

```ts
import type { Database } from "../database.types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type ProductExtra = Database["public"]["Tables"]["product_extras"]["Row"];
```

- [ ] **Step 5: Crear barrel `domain/index.ts`**

```ts
export * from "./order";
export * from "./product";
```

- [ ] **Step 6: Reemplazar tipos hand-rolled en desktop**

Editar `apps/desktop/src/shared/types.ts` para:

- Eliminar definiciones de `Order`, `OrderItem`, `Product`, `Category`.
- Mantener solo tipos específicos de Electron: `IPC channels` const, `PrinterConfig`, `AppConfig`.
- Añadir re-exports al final:

```ts
export type { Order, OrderItem, Product, Category, ProductExtra } from "@garum/shared/domain";
```

(Esto evita romper imports existentes en otros archivos del desktop.)

- [ ] **Step 7: Verificar typecheck en desktop**

```bash
pnpm --filter desktop typecheck
```

Expected: pasa sin errores. Si falla porque algún campo de `OrderItem` no coincide con uso real, ajustar la definición en `packages/shared/src/domain/order.ts` y re-ejecutar.

- [ ] **Step 8: Verificar typecheck en web**

```bash
pnpm --filter web typecheck
```

Expected: pasa.

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/desktop
git commit -m "feat(shared): add domain types and consolidate from desktop"
```

---

## Task 11: Actualizar barrel principal `packages/shared/src/index.ts`

**Files:**

- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Reemplazar contenido del barrel**

```ts
export * from "./order-routing";
export * from "./domain";
export * from "./format";
export * from "./constants";
export type * from "./database.types";
```

- [ ] **Step 2: Verificar typecheck en los tres paquetes**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
pnpm typecheck
```

Expected: pasa en `@garum/shared`, `web`, `desktop`.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export all submodules from main barrel"
```

---

## Task 12: Migrar Husky/lint-staged y prettier al root

**Files:**

- Move: `apps/web/.husky/` → `.husky/`
- Modify: root `package.json` (lint-staged config)
- Delete: `apps/web/.husky/`

- [ ] **Step 1: Mover `.husky/` al root**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
git mv apps/web/.husky .husky
```

- [ ] **Step 2: Añadir husky + lint-staged + prettier al `package.json` root**

Modificar root `package.json` añadiendo:

```json
{
  "scripts": {
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^15.5.2",
    "prettier": "^3.4.2"
  },
  "lint-staged": {
    "apps/web/**/*.{ts,tsx,js,jsx}": ["pnpm --filter web exec eslint --fix"],
    "apps/desktop/**/*.{ts,tsx,js,jsx}": ["pnpm --filter desktop exec eslint --fix"],
    "packages/shared/**/*.ts": ["pnpm --filter @garum/shared exec tsc --noEmit"],
    "**/*.{json,md,css,yml,yaml}": ["prettier --write"]
  }
}
```

(Mantener los scripts y deps existentes.)

- [ ] **Step 3: Editar `.husky/pre-commit` para que use el lint-staged del root**

Contenido de `.husky/pre-commit`:

```bash
pnpm exec lint-staged
```

(Eliminar `cd apps/web` o lo que existiese antes — ahora el hook corre desde la raíz.)

- [ ] **Step 4: Eliminar `lint-staged` y `husky` del `apps/web/package.json` (si los tuviera)**

Buscar y borrar bloques `"lint-staged"` y dependencias `husky`/`lint-staged` en `apps/web/package.json`.

- [ ] **Step 5: pnpm install y verificar que husky se instala**

```bash
pnpm install
ls .husky/pre-commit
```

Expected: archivo existe y es ejecutable.

- [ ] **Step 6: Test rápido del hook**

```bash
echo "// trivial change" >> packages/shared/src/index.ts
git add packages/shared/src/index.ts
git commit -m "test: trigger lint-staged" --dry-run
git checkout -- packages/shared/src/index.ts
```

(El --dry-run no ejecuta el hook; en su lugar, hacer un commit real menor y verificar que lint-staged corre.)

- [ ] **Step 7: Commit**

```bash
git add .husky package.json apps/web/package.json pnpm-lock.yaml
git commit -m "chore: move husky and lint-staged to monorepo root"
```

---

## Task 13: Configurar CI para el monorepo

**Files:**

- Move: `apps/web/.github/workflows/` → `.github/workflows/`
- Modify: workflows existentes para usar pnpm + monorepo

- [ ] **Step 1: Mover workflows al root**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
mkdir -p .github
git mv apps/web/.github/workflows .github/workflows
```

- [ ] **Step 2: Reescribir `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter web build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
          NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}
```

- [ ] **Step 3: Reescribir `.github/workflows/deploy.yml` (si existía) para apuntar a `apps/web`**

Inspeccionar el workflow actual:

```bash
cat .github/workflows/deploy.yml
```

Sustituir cualquier `working-directory: ./` por `working-directory: ./apps/web` y los pasos de install por:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
- run: pnpm install --frozen-lockfile
- run: pnpm --filter web build
```

(Ajustar al método de deploy que ya tengas — Vercel suele desplegar automáticamente desde GitHub si el "Root Directory" en Vercel está bien configurado, en cuyo caso este workflow puede ser innecesario.)

- [ ] **Step 4: Validar sintaxis YAML**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: ningún output (significa que es YAML válido).

- [ ] **Step 5: Commit**

```bash
git add .github apps/web/.github
git commit -m "ci: migrate workflows to monorepo with pnpm"
```

---

## Task 14: Verificación end-to-end

**Files:** ninguno modificado, solo verificación

- [ ] **Step 1: Limpiar y reinstalar desde cero**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
rm -rf node_modules apps/web/node_modules apps/desktop/node_modules packages/shared/node_modules
rm -rf apps/web/.next apps/desktop/out apps/desktop/dist
pnpm install
```

Expected: instalación limpia sin errores.

- [ ] **Step 2: Typecheck completo**

```bash
pnpm typecheck
```

Expected: pasa en los tres paquetes.

- [ ] **Step 3: Tests unitarios completos**

```bash
pnpm test
```

Expected: pasan tests del shared (order-routing, format-currency, format-datetime). Web y desktop ejecutan sus tests propios.

- [ ] **Step 4: Build de la web**

```bash
pnpm --filter web build
```

Expected: termina con "Compiled successfully" y muestra el resumen de rutas. Si falla por env vars, verificar `apps/web/.env.local`.

- [ ] **Step 5: Dev de la web**

```bash
pnpm web:dev
```

Abrir http://localhost:3001 en navegador, verificar que la home carga con el logo y la paleta correctas. Cmd+C para parar.

- [ ] **Step 6: Dev del desktop**

```bash
pnpm desktop:dev
```

Verificar que la ventana Electron abre, muestra "Sin conexión" o conecta a Supabase, y el panel de órdenes renderiza. Cerrar ventana para terminar.

- [ ] **Step 7: Tests E2E web (Playwright)**

```bash
pnpm --filter web exec playwright test
```

Expected: todos los proyectos (public, public-mobile, admin) pasan.

- [ ] **Step 8: Tests E2E desktop (Playwright)**

```bash
pnpm --filter desktop exec playwright test
```

Expected: pasan los tests existentes.

- [ ] **Step 9: Verificar que `git log` preserva historial completo**

```bash
git log apps/web/lib/supabase.ts --oneline | head
git log apps/desktop/src/main/realtime.ts --oneline | head
```

Expected: cada uno muestra varios commits con fechas reales pre-migración.

- [ ] **Step 10: Crear remoto del monorepo y push**

(Manual — el usuario decide si reutilizar uno de los remotos existentes o crear repo nuevo en GitHub. NO hacer este paso automáticamente.)

```bash
# Ejemplo si se crea repo nuevo:
git remote add origin git@github.com:USUARIO/garum-monorepo.git
git branch -M main
git push -u origin main
git push origin --tags
```

- [ ] **Step 11: Cleanup post-migración**

```bash
cd /Users/ivangonzalez/Documents/proyectos/GARUM
ls -la .Garum.old .garum-desktop.old   # confirmar que existen
# Solo eliminar tras confirmar que el push remoto fue exitoso y los tests E2E pasaron
rm -rf .Garum.old .garum-desktop.old
```

(Mantener `/Users/ivangonzalez/garum-migration-backup/` con los `.env.local` durante al menos una semana antes de borrar.)

- [ ] **Step 12: Configurar Vercel "Root Directory"**

Manual en el dashboard de Vercel:

1. Ir a Project Settings → General
2. Cambiar "Root Directory" de `./` a `apps/web`
3. Cambiar el repo de origen al nuevo monorepo si aplica
4. Guardar y disparar redeploy de prueba

(NO hacer este paso antes de mergear a `main` — el deploy fallaría hasta que el Root Directory coincida con la nueva estructura.)

---

## Resumen de archivos creados/modificados

### Creados

- `pnpm-workspace.yaml`
- `package.json` (root)
- `tsconfig.base.json`
- `.gitignore`, `.npmrc`, `README.md` (root)
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/order-routing.ts`
- `packages/shared/src/database.types.ts` (vía `git mv`)
- `packages/shared/src/domain/{order,product,index}.ts`
- `packages/shared/src/format/{currency,datetime,index}.ts`
- `packages/shared/src/constants/{destinations,payment-status,allergens,index}.ts`
- `packages/shared/tests/{order-routing,format-currency,format-datetime}.test.ts`

### Modificados

- `apps/web/package.json` (deps, lint-staged removido)
- `apps/web/next.config.ts` (transpilePackages)
- `apps/web/lib/**/*.ts` (imports actualizados)
- `apps/desktop/package.json` (deps)
- `apps/desktop/src/shared/types.ts` (re-exports)
- `apps/desktop/src/main/*.ts` (imports actualizados, today() removido)

### Eliminados

- `apps/web/lib/order-routing.ts`
- `apps/web/lib/database.types.ts` (movido)
- `apps/web/tests/unit/order-routing.test.ts`
- `apps/web/package-lock.json`
- `apps/desktop/src/shared/order-routing.ts`
- `apps/desktop/tests/unit/order-routing.test.ts`
- `apps/desktop/tests/unit/today.test.ts`
- `apps/desktop/package-lock.json`

### Movidos

- `apps/web/.husky/` → `.husky/`
- `apps/web/.github/workflows/` → `.github/workflows/`
- `apps/web/docs/superpowers/` → `docs/superpowers/`

---

## Notas para el ejecutor

- **No saltar Task 1.** Los tags `pre-monorepo` son la única vía atrás si algo se rompe en Tasks 2–3.
- **No ejecutar Task 14 Step 11** (eliminar `.Garum.old/`) hasta que Step 10 (push remoto) haya sido exitoso y los E2E pasen.
- **Vercel deploy fallará** hasta que se configure Root Directory en Task 14 Step 12. Mergear a `main` solo cuando esté listo.
- **El plan asume que ambos repos viejos están limpios** (sin commits locales sin pushear, sin cambios pendientes). Task 1 Step 1 verifica esto. Si hay trabajo en curso, mergear o hacer stash antes.
- **`order-routing.ts` se asume idéntico** entre web y desktop (Task 5 Step 1). Si difieren, leer ambos y reconciliar manualmente; documentar diferencias en el commit.
- Los **tests E2E del desktop** dependen de un display gráfico — no corren en GitHub Actions Linux por defecto. Solo locales en V1.
