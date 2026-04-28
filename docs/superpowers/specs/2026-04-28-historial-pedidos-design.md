# Historial de pedidos — diseño

**Fecha:** 2026-04-28
**Estado:** Aprobado por el usuario, pendiente de plan de implementación

## Contexto

El panel de comandas actual solo muestra pedidos activos (`payment_status = 'paid'` y `staff_status <> 'done'`). Cuando un camarero pulsa "✓ LISTO", el pedido desaparece de la pantalla y no hay forma de consultarlo después.

Se quiere:
1. Que los pedidos completados de **hoy** sigan visibles en el panel principal (cocina/barra), atenuados.
2. Que los pedidos de **días anteriores** se consulten en una pestaña nueva "Historial" del sidebar.

## Decisiones tomadas durante brainstorming

| Decisión | Valor |
|----------|-------|
| Frontera "hoy" | Día natural calendario en hora local (Madrid). 00:00–23:59. |
| Pedidos `done` en cocina/barra | Tarjetas atenuadas al fondo de su columna, sin botón LISTO, con etiqueta "✓ HH:MM". |
| Pestaña Historial | Lista agrupada por día, infinite scroll, solo lectura. |
| Acciones en historial | Ninguna (sin reimprimir, sin reabrir). |
| Deshacer LISTO | No soportado. |
| Pedidos cancelados | En historial sí; en panel de hoy no. |

## Arquitectura

Main sigue siendo el único módulo que habla con Supabase. El renderer accede a través de IPC. Dos contextos de datos en main:

- **Cache "hoy"** — `Map<string, Order>` en memoria. Contiene todos los pedidos `paid` de hoy, sea cual sea su `staff_status`. Se mantiene vivo por el listener Realtime.
- **Historial bajo demanda** — Nuevo handler IPC `history:list(limit, offset)` que consulta Supabase paginado y devuelve una página de pedidos antiguos.

## Cambios en el modelo de datos

Ninguno. La tabla `orders` no requiere columnas nuevas. Se aprovechan los campos existentes:
- `created_at` para definir la frontera "hoy".
- `payment_status` (`paid` | `cancelled`) para el filtro principal.
- `staff_status` (`pending` | `done`) para el rendering visual.

## Queries

### Carga inicial del cache "hoy"

```sql
SELECT *
FROM orders
WHERE payment_status = 'paid'
  AND created_at >= <hoy 00:00 Europe/Madrid>
  AND created_at <  <mañana 00:00 Europe/Madrid>
ORDER BY created_at ASC
```

Sin filtro de `staff_status`: los `done` también entran. Se ejecuta:
- Al arrancar la app.
- Tras cada cambio de día (timer de medianoche).
- Tras reconexión Realtime.

### Listado de historial (paginado)

```sql
SELECT *
FROM orders
WHERE payment_status IN ('paid', 'cancelled')
  AND created_at < <hoy 00:00 Europe/Madrid>
ORDER BY created_at DESC
LIMIT 50 OFFSET <n>
```

Tamaño de página: 50. El renderer hace fetch al abrir la pestaña Historial y al alcanzar el final del scroll.

## Lógica del listener Realtime

Suscripción a `postgres_changes` sobre tabla `orders`. Para cada `payload.new`:

1. Calcular si `created_at` cae en el rango "hoy" Madrid.
2. Si **es de hoy**:
   - `payment_status === 'paid'` → upsert en cache, emitir `ORDERS_NEW` al renderer.
   - `payment_status === 'cancelled'` → eliminar del cache, emitir `ORDERS_REMOVED`.
3. Si **no es de hoy** → ignorar (no afecta ni al panel principal ni al historial activo, ya que historial se refresca al abrir).

## Cambio de día

Al arrancar y tras cada disparo, se programa un `setTimeout` con duración hasta la próxima medianoche local Madrid. Al disparar:

1. Refetch de la query "hoy" (que devolverá vacío justo después de cruzar medianoche).
2. Reposicionar el siguiente timer (24h).
3. Emitir `ORDERS_INIT` al renderer con el nuevo cache (vacío).

Esto deja el panel cocina/barra limpio al inicio del nuevo día. Los pedidos de ayer pasan a estar disponibles vía la pestaña Historial.

## Cambios en el renderer

### Sidebar
Añadir entrada "📜 Historial" entre "🍽 Comandas" y "⚙️ Configuración" en `App.tsx`. Tipo `Page` se extiende: `'orders' | 'history' | 'settings'`.

### Panel cocina/barra (`pages/Orders.tsx`)
Mismo layout. Cambios visuales:
- Items se agrupan en dos sub-listas internas dentro de cada columna: `activos` (staff_status = pending) y `completados` (staff_status = done), en ese orden.
- Tarjeta de pedido recibe prop `done: boolean`. Si `true`:
  - Opacidad 0.5
  - Borde y fondo más oscuros
  - Sin botón "✓ LISTO"
  - Cabecera muestra "✓ HH:MM" donde `HH:MM` es la hora a la que se marcó done.

Implicación: necesitamos saber **cuándo** se marcó done.
- **Decisión**: en la fase de implementación se inspecciona el esquema de `orders`. Si existe `updated_at` (o equivalente), se usa. Si no, se muestra "✓" sin hora hasta que se añada la columna en el backend (decisión separada del repo Garum web).
- Esta dependencia se resuelve en el plan, no en este spec.

### Página Historial (`pages/History.tsx`)
Componente nuevo. Estructura:

```
┌─────────────────────────────────────┐
│ Historial                           │
├─────────────────────────────────────┤
│ ── Ayer ──────────                  │
│ [Tarjeta pedido]                    │
│ [Tarjeta pedido]                    │
│ ── Mar 22 abr ────                  │
│ [Tarjeta pedido]                    │
│ ...                                 │
│         [scroll infinito carga +]   │
└─────────────────────────────────────┘
```

Tarjeta de historial: mesa, hora `HH:MM`, items resumidos (un renglón por item: `2× Calamares`), total, y badge si fue `cancelled`.

Cabecera de día: "Hoy" no aplica (los de hoy están en el panel principal); "Ayer" para `today - 1 día`; resto en formato `Día DD MMM` o `DD/MM/YYYY` para fechas anteriores a la semana.

Hooks:
- `useEffect` al montar: fetch primera página.
- `IntersectionObserver` o evento scroll para detectar fin → fetch siguiente página.
- Estado: `pages: Order[][]`, `loading: boolean`, `hasMore: boolean`.

## Cambios en IPC y tipos compartidos

`src/shared/types.ts`:
```ts
export const IPC = {
  // ... existentes ...
  HISTORY_LIST: 'history:list',
} as const;
```

`src/preload/index.ts`:
```ts
listHistory: (limit: number, offset: number): Promise<Order[]> =>
  ipcRenderer.invoke(IPC.HISTORY_LIST, { limit, offset }),
```

`src/main/ipc.ts`:
```ts
ipcMain.handle(IPC.HISTORY_LIST, async (_e, { limit, offset }: { limit: number; offset: number }) => {
  return listHistory(limit, offset);
});
```

`src/main/realtime.ts` (o módulo nuevo `history.ts`):
```ts
export async function listHistory(limit: number, offset: number): Promise<Order[]> {
  if (!supabase) return [];
  const startToday = startOfTodayMadridIso();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('payment_status', ['paid', 'cancelled'])
    .lt('created_at', startToday)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[Realtime] Error en historial:', error.message);
    return [];
  }
  return (data ?? []) as Order[];
}
```

## Helpers de zona horaria

Función pura para calcular el inicio del día actual en Europe/Madrid en formato ISO:

```ts
function startOfTodayMadridIso(): string {
  const now = new Date();
  // Formatter para obtener el día YYYY-MM-DD en zona Madrid
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const ymd = fmt.format(now); // "2026-04-28"
  // Construir Date a 00:00 Madrid → ISO UTC
  // Madrid offset: +01:00 (CET) o +02:00 (CEST). Usar Intl para sacar offset actual.
  // Implementación detallada en plan.
}
```

El plan de implementación detallará esta función incluyendo manejo de cambio de horario CET/CEST.

## Pruebas (qué cubrir)

- Unidad: `startOfTodayMadridIso()` con varios momentos del día y cambio horario.
- Integración main: `listHistory(50, 0)` devuelve pedidos solo anteriores a hoy.
- Integración main: el handler de Realtime mete pedidos de hoy en el cache, ignora pedidos de otros días.
- E2E (Playwright): pedido `done` aparece atenuado al fondo de su columna.
- E2E: pestaña Historial carga primera página y agrupa por fecha.
- Manual: cambio de día (mock del reloj o pruebas a las 23:59).

## Dependencias y riesgos

- **Realtime sigue sin estar verificado**. El bug de "se queda conectando" no fue probado tras el fix del crash de Electron. Validar primero que la conexión funciona antes de añadir features encima.
- **Columna `done_at` o `updated_at`** — decisión de implementación: si la tabla no tiene, hay que añadirla en el repo de la app web Garum o vivir con "✓ HH:MM" calculado a partir de `created_at` (no es la hora real de finalizado).

## Fuera de alcance

- Deshacer LISTO.
- Reimprimir desde historial.
- Filtros, búsqueda, date picker.
- Auditoría (qué usuario marcó cada pedido).
- Exportación a CSV/PDF.
