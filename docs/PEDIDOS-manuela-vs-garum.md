# Pedidos: por qué Manuela funciona y Garum no termina de hacerlo

> Comparativa del flujo de pedidos entre **Manuela** (funciona sin fallos) y **Garum** (falla intermitentemente), con la causa raíz y el plan para igualarlo.

---

## TL;DR — La diferencia de fondo

No son el mismo sistema. **Manuela y Garum usan dos arquitecturas distintas** para que un pedido llegue a la impresora:

|                              | **Manuela (robusto)**                                   | **Garum (frágil)**                                                                        |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ¿Quién inserta el pedido?    | El **navegador del cliente**, directo a Supabase        | El **servidor** (`/api/checkout`)                                                         |
| ¿Cuándo se inserta?          | **Después** de cobrar en Stripe                         | **Antes** de cobrar (queda `pending`)                                                     |
| ¿Qué dispara la impresión?   | El **INSERT** del pedido                                | Un **UPDATE a `paid`** que hace el **webhook de Stripe**                                  |
| ¿De qué depende que imprima? | De nada más: insertó → suena                            | Del **webhook de Stripe** + de que el desktop esté **autenticado con cuenta de servicio** |
| Quién escucha                | `agente-impresora` con la **anon key**, evento `INSERT` | `apps/desktop` con **login de servicio**, evento `UPDATE` a `paid`                        |

**Manuela imprime en el instante en que el pedido existe.** Garum solo imprime cuando un webhook externo (Stripe → tu servidor) confirma el pago y cambia el estado a `paid`. Ese webhook —y la autenticación del desktop— son **dos puntos de fallo que en Manuela no existen**. Ahí está el "no termina de funcionar bien".

---

## 1. Cómo funciona Manuela (el modelo que quieres replicar)

**Tabla `pedidos`** (`db_schema.sql`):

```sql
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  order_type   TEXT NOT NULL,          -- 'eat-in' | 'take-out'
  table_number TEXT,
  total_amount NUMERIC(10,2) NOT NULL,
  status       TEXT DEFAULT 'pending', -- pending|preparing|completed|cancelled
  items        JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
-- RLS: INSERT anónimo permitido, lectura pública
```

**Flujo (4 pasos, sin intermediarios):**

1. Cliente escanea QR de mesa → arma carrito → paga con Stripe (`PaymentScreen.jsx`, `confirmPayment`).
2. **Tras el pago OK**, el propio navegador inserta el pedido (`web-manuela-1/src/pages/KioskFlow.jsx`):

   ```js
   const { error } = await supabase.from("pedidos").insert([
     {
       order_number: finalOrderNumber,
       order_type: orderType,
       table_number: orderType === "eat-in" ? tableNumber.toString() : null,
       total_amount: cartTotal,
       items: cart,
       status: "pending",
     },
   ]);
   ```

3. `agente-impresora/index.js` está suscrito **directamente** y escucha el **INSERT**:

   ```js
   supabase.channel('public:pedidos')
     .on('postgres_changes',
         { event: 'INSERT', schema: 'public', table: 'pedidos' },
         async (payload) => { await encolarPedido(payload.new); })
     .subscribe(...)   // reconexión automática cada 5s
   ```

   Usa la **anon key directamente** (`createClient(SUPABASE_URL, SUPABASE_KEY)`), **sin login**.

4. El agente agrupa los items por categoría (`CATEGORY_TO_PRINTER`) e imprime en cocina/bebidas (impresoras TCP `192.168.1.122:9100` y `:123`), con 3 reintentos.

**Por qué es a prueba de balas:** entre "el cliente pagó" y "suena la impresora" no hay servidor propio, ni webhook, ni paso de autenticación. El INSERT _es_ la señal. Si Supabase está vivo, funciona.

---

## 2. Cómo funciona Garum (y dónde se rompe)

**Tabla `orders`** (`apps/web/supabase/migrations/001_initial_schema.sql`): `payment_status IN ('pending','paid','cancelled')`, más columnas añadidas en migraciones (`staff_status_kitchen/bar`, `printed_at`, `printed_targets`). Realtime habilitado.

**Flujo (muchos más eslabones):**

1. Cliente escanea QR (`app/[mesa]/page.tsx`) → carrito en `localStorage` → pulsa pagar → `CheckoutDialog.tsx`.
2. `POST /api/checkout` (servidor) **inserta el pedido ANTES de cobrar**, en estado `pending` (`route.ts:170`):

   ```ts
   .insert([{ table_number, total_amount, payment_status: "pending", items, ... }])
   ```

   Luego crea la sesión/PaymentIntent de Stripe y guarda `stripe_session_id`.

3. El cliente paga en Stripe.
4. **Stripe llama al webhook** `POST /api/webhook`, que verifica la firma y marca `paid` (`webhook/route.ts:69`):

   ```ts
   stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)  // línea 96
   ...
   .update({ payment_status: "paid" }).in("payment_status", ["pending","cancelled"])
   ```

5. El **UPDATE a `paid`** dispara Realtime. `apps/desktop/src/main/realtime.ts` lo recibe **pero solo si**:
   - Antes hizo **login de cuenta de servicio** (`signInWithPassword`, línea 262), que es **FATAL si faltan** `VITE_DESKTOP_EMAIL` / `VITE_DESKTOP_PASSWORD` (línea 255).
   - El pedido está en `paid` — si no, lo ignora (`handleChange`, línea 625: `if (order.payment_status !== 'paid') return;`).
6. Si todo eso ocurre, imprime (`reservePrintAndDispatch` → `printOrder`).

**Los dos puntos de fallo que Manuela no tiene:**

### 🔴 Punto de fallo #1 — El webhook de Stripe

El pedido **solo se vuelve imprimible cuando Stripe consigue llamar a tu webhook** y la firma valida. Si:

- el endpoint del webhook no está dado de alta en Stripe para el dominio de producción, o
- `STRIPE_WEBHOOK_SECRET` no coincide (firma inválida → 400), o
- en local no corre `stripe listen`, o
- hay un corte de red Stripe→servidor,

…entonces el pedido se queda **`pending` para siempre** y **el desktop nunca lo ve** (porque solo procesa `paid`). El cliente ve "pago correcto" en Stripe, pero a cocina no llega nada. En Manuela esto es imposible: el pedido lo inserta el navegador, no depende de ningún webhook.

### 🔴 Punto de fallo #2 — Auth de cuenta de servicio del desktop

El desktop **no escucha hasta autenticarse** con `VITE_DESKTOP_EMAIL/PASSWORD`. Si no están inyectadas en el build (GitHub Secrets) o la cuenta/política RLS no es correcta, el desktop se queda en "Conectando…" en silencio y **no imprime nada**. El agente de Manuela usa la anon key directa: no hay paso que pueda fallar.

> Nota: Garum tiene un **reconciliador** cada 15s que re-lee por REST y recupera eventos de Realtime perdidos — buena defensa contra el punto #2 una vez autenticado. Pero **no salva el punto #1**: si el pedido sigue `pending` porque el webhook no llegó, el reconciliador también lo ignora (solo trae `paid`).

---

## 3. Diagnóstico: qué comprobar primero en Garum

En orden de probabilidad:

1. **¿Los pedidos se quedan en `payment_status = 'pending'` en la tabla `orders`?**
   Si sí → es el **webhook** (#1). Revisa en el dashboard de Stripe → Developers → Webhooks: que el endpoint `https://<tu-dominio>/api/webhook` exista, esté "enabled", y que el `whsec_...` coincida con `STRIPE_WEBHOOK_SECRET` del servidor. Revisa los intentos fallidos del webhook ahí mismo.
2. **¿Hay pedidos `paid` pero el desktop no imprime / dice "Conectando…"?**
   Si sí → es la **auth del desktop** (#2). Verifica `VITE_DESKTOP_EMAIL/PASSWORD` en el build y la política RLS de la cuenta de servicio (migraciones 012/014). Busca en logs `FATAL: VITE_DESKTOP_EMAIL...`.
3. **¿Pedidos `paid` con `printed_at` NULL?** Impresora caída; debería reintentar cada 15s.

---

## 4. Cómo replicar el modelo de Manuela en Garum

Dos caminos. Recomiendo el **A** si el objetivo es "que funcione como Manuela ya".

### Opción A — Igualar a Manuela: que el INSERT dispare la impresión (quitar dependencia del webhook)

Hacer que el pedido **se inserte ya pagado** y que el desktop imprima al **INSERT `paid`**, no esperando un UPDATE del webhook:

- Cambiar al **Payment Element embebido** (Garum ya tiene `/api/payment-intent`): cobrar en el cliente con `confirmPayment` y, **solo al confirmarse**, crear el pedido directamente en `orders` con `payment_status='paid'` (como hace Manuela). El webhook queda como **respaldo/conciliación**, no como camino principal.
- El desktop ya escucha `event: '*'`, así que captará el INSERT; basta confirmar que `handleChange` trata un INSERT `paid` igual que un UPDATE `paid` (lo hace: filtra por `payment_status === 'paid'`).
- Ventaja: elimina el punto de fallo #1 por completo. Inconveniente: validación de precio/importe pasa a ser responsabilidad del cliente+servidor antes de marcar `paid` (mantener el recálculo server-side de `/api/payment-intent`).

### Opción B — Mantener la arquitectura de Garum pero blindarla

- Asegurar el webhook (alta en Stripe, secreto correcto, monitor de reintentos).
- Asegurar la inyección de `VITE_DESKTOP_EMAIL/PASSWORD` y las políticas RLS del desktop.
- Añadir en `/admin` una alerta visible de pedidos `pending > 15 min` (zombies) para no depender de mirar la BD a mano.
- Mantiene las ventajas de Garum (validación server-side, idempotencia por impresora, reconciliador), pero conserva el webhook como dependencia.

---

## 5. Tablas de equivalencia (para la migración)

| Concepto             | Manuela                                             | Garum                                            |
| -------------------- | --------------------------------------------------- | ------------------------------------------------ |
| Tabla                | `pedidos`                                           | `orders`                                         |
| Estado de pago       | `status` (`pending`…) — y el pedido ya está cobrado | `payment_status` (`pending`→`paid`)              |
| Mesa                 | `table_number` (TEXT)                               | `table_number` (INT)                             |
| Items                | `items` JSONB                                       | `items` JSONB                                    |
| Total                | `total_amount`                                      | `total_amount`                                   |
| Canal realtime       | `public:pedidos`, evento `INSERT`                   | `garum_desktop`, evento `*` (filtra `paid`)      |
| Quién escucha        | `agente-impresora` (anon key, sin login)            | `apps/desktop` (cuenta de servicio, login)       |
| Ruteo a impresora    | `CATEGORY_TO_PRINTER` por `item.categoria`          | `destination` (`cocina`/`barra`) en `categories` |
| Disparo de impresión | INSERT del pedido                                   | UPDATE a `paid` (vía webhook)                    |

```

```
