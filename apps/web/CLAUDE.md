@AGENTS.md

# Garum Vinoteca — Web de Pedidos en Mesa

Sistema de pedidos mediante QR con pago online integrado (Stripe) y gestión de comandas en tiempo real por cocina/barra.

---

## Next.js 16.2.2 (React 19) — LEER ANTES DE ESCRIBIR CÓDIGO

- `params` en page components es una `Promise` — usar `use(params)` en Client Components o `await params` en Server Components.
- **`"use client"`** obligatorio en cualquier componente que use hooks, eventos del DOM o `<style jsx>`.
- **`<style jsx>` SOLO en Client Components.** Los Server Components no soportan styled-jsx — usar clases CSS globales o archivos `.css` importados.
- Leer `node_modules/next/dist/docs/` ante cualquier duda de API.

---

## Identidad Visual

- **Modo:** Light — fondo verde claro (hojas del logo) + lila uva como color principal. Áreas con logo en blanco.
- **Paleta (variables CSS en `globals.css`):**
  | Variable | Valor | Uso |
  |---|---|---|
  | `--background` | `#D6E8D2` | Fondo general — verde claro de las hojas del logo |
  | `--surface` | `#FFFFFF` | Blanco — áreas/tarjetas donde aparece el logo |
  | `--primary` | `#7B4F96` | Lila de la uva del logo — botones, acentos |
  | `--primary-hover` | `#9060B0` | Hover de botones |
  | `--primary-light` | `rgba(123,79,150,0.08)` | Fondos suaves |
  | `--secondary` | `#4A7860` | Verde salvia oscuro — apoyo tipográfico |
  | `--text` | `#111111` | Texto principal |
  | `--text-muted` | `#5A6E5E` | Texto secundario |
  | `--border` | `rgba(123,79,150,0.18)` | Bordes |
- **Admin y Staff:** fondo oscuro `#0a0a0a` — mejor legibilidad en cocina. Sus estilos están en `app/admin/admin.css`.
- **Tipografía:** Playfair Display (`--font-playfair`, títulos) + Inter (`--font-inter`, UI).
- **Clases utilitarias globales:** `.glass`, `.gold-text`, `.gold-button`, `.serif`.

---

## Tech Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.2 — App Router |
| Base de datos | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Pagos | Stripe Checkout Sessions — API `2026-03-25.dahlia` |
| Estilos | CSS global `globals.css` + `admin.css` + `<style jsx>` (solo en Client Components) |
| Auth | Supabase SSR (`@supabase/ssr`) con cookies — NO localStorage para sesiones de admin/staff |

---

## Clientes Supabase — cuál usar en cada caso

| Archivo | Cuándo usarlo |
|---|---|
| `lib/supabase.ts` | Solo lectura pública de datos (menú, productos). No gestiona sesión. |
| `lib/supabase-browser.ts` | **Client Components** que necesitan auth (login, logout, staff page). Usa `createBrowserClient` de `@supabase/ssr` — guarda sesión en **cookies**. |
| `lib/supabase-server.ts` | **Server Components** y Server Actions que necesitan leer sesión. Usa `createServerClient` de `@supabase/ssr`. |

> **Error común:** usar `lib/supabase.ts` para hacer login. La sesión queda en `localStorage` y el middleware (que lee cookies) no la ve → bucle de redirecciones.

---

## Estructura de Rutas

```
app/
├── page.tsx                          # Home pública — 5 clics en logo → /admin/login
├── [mesa]/page.tsx                   # Carta del cliente — "use client"
├── success/page.tsx                  # Confirmación de pago — "use client"
│
├── admin/
│   ├── login/page.tsx                # Login admin — "use client", sin layout
│   └── (dashboard)/                  # Route group: hereda layout con AdminNav
│       ├── layout.tsx                # Nav lateral + fondo oscuro
│       ├── page.tsx                  # Dashboard con stats
│       ├── categories/               # CRUD categorías
│       └── products/                 # CRUD productos (imagen, alérgenos, extras)
│
├── staff/
│   ├── login/page.tsx                # Login staff — "use client"
│   └── page.tsx                      # Panel comandas Realtime — "use client"
│
└── api/
    ├── checkout/route.ts             # POST — crea orden en Supabase + Stripe Session
    └── webhook/route.ts              # POST — Stripe webhook → marca order como 'paid'
```

**Acceso oculto al admin:** 5 clics rápidos sobre el logo "GARUM" en la home → `/admin/login`.

---

## Variables de Entorno (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Solo en servidor — webhook y operaciones admin
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=              # Obtener en Stripe Dashboard → Webhooks
```

---

## Esquema Supabase

### `categories`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Nombre visible |
| `slug` | text unique | Para anclas de URL |
| `destination` | text | `'cocina'` o `'barra'` — determina a qué pantalla del staff va |
| `icon` | text | Nombre de icono Lucide |
| `sort_order` | int | Orden en la carta |

### `products`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `category_id` | uuid FK → categories | |
| `name` | text | |
| `description` | text | |
| `price` | numeric(10,2) | En euros |
| `image_url` | text | URL pública de Supabase Storage (bucket `products`) |
| `allergen_ids` | int[] | IDs de la tabla `allergens` (1–14, estándar UE) |
| `is_available` | boolean | |
| `sort_order` | int | |

### `product_extras`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK → products | |
| `name` | text | |
| `price` | numeric(10,2) | Coste adicional |

### `orders`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `table_number` | int | Número de mesa |
| `items` | jsonb | Array de `{id, name, price, quantity}` |
| `total_amount` | numeric(10,2) | En euros |
| `payment_status` | text | `'pending'` / `'paid'` / `'cancelled'` |
| `stripe_session_id` | text unique | Para deduplicar webhooks |
| `created_at` | timestamptz | |

### `allergens`
14 alérgenos oficiales UE, ids 1–14. Seed incluido en `supabase/migrations/001_initial_schema.sql`.

**RLS:** lectura pública en `categories`, `products`, `product_extras`, `allergens`. `orders` solo se inserta públicamente; lectura/actualización requiere auth. Admin gestiona el menú con auth.

---

## Flujo de Pago

1. Cliente pulsa "PAGAR" → `POST /api/checkout`
2. Checkout crea la orden en Supabase con `payment_status: 'pending'`
3. Crea Stripe Checkout Session con `client_reference_id = order.id`
4. Redirige a Stripe → cliente paga
5. Stripe llama a `POST /api/webhook` con evento `checkout.session.completed`
6. Webhook actualiza `payment_status = 'paid'` en Supabase
7. Supabase Realtime notifica al panel `/staff` en tiempo real

---

## Lógica Cocina vs Barra

El campo `destination` de `categories` determina en qué columna del panel de staff aparece cada ítem. El panel filtra los ítems de cada pedido por el `destination` de su categoría.

> **Actualmente** el staff filtra por palabras clave en el nombre del producto (fallback). Pendiente conectar con el campo `destination` de la categoría via join en la query de pedidos.

---

## Reglas de Desarrollo

- **Mobile First:** 100% de clientes piden desde móvil. Touch targets mínimo 44px.
- **Sin placeholders en producción.** Micro-animaciones con `transition: 0.2s ease`.
- **Errores de pago:** siempre feedback visual — nunca solo `console.error`.
- **Carrito:** persiste en `localStorage` bajo la clave `garum-cart`. Se limpia en `/success`.
- **TypeScript:** evitar `any`. Excepción aceptada en handlers de Stripe/Supabase donde el tipo no está disponible.
- **Server Components por defecto.** Solo añadir `"use client"` cuando sea estrictamente necesario.
- **Imágenes de productos:** subidas a Supabase Storage bucket `products` (público). La URL pública se guarda en `products.image_url`.
- **Migraciones:** el schema completo está en `supabase/migrations/001_initial_schema.sql`. Aplicar manualmente en el SQL Editor de Supabase si las tablas no existen.
