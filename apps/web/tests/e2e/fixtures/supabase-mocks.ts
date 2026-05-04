import { Page } from "@playwright/test";

type MockSettings = { maintenance_enabled?: boolean; maintenance_message?: string };

type MockCategory = {
  id: string;
  name: string;
  slug: string;
  destination: "cocina" | "barra";
  icon: string | null;
  sort_order: number;
  parent_id: string | null;
  products: Array<{
    id: string;
    category_id: string;
    name: string;
    description: string;
    price: number;
    image_url: string | null;
    allergen_ids: number[];
    is_available: boolean;
    sort_order: number;
    product_extras: Array<{ id: string; product_id: string; name: string; price: number }>;
  }>;
};

export const DEFAULT_CATEGORIES: MockCategory[] = [
  {
    id: "cat-1",
    name: "Tapas",
    slug: "tapas",
    destination: "cocina",
    icon: "🍤",
    sort_order: 1,
    parent_id: null,
    products: [
      {
        id: "prod-1",
        category_id: "cat-1",
        name: "Croquetas de jamón",
        description: "Cremosas, tradicionales — 6 uds",
        price: 8.5,
        image_url: null,
        allergen_ids: [1, 7],
        is_available: true,
        sort_order: 1,
        product_extras: [],
      },
      {
        id: "prod-2",
        category_id: "cat-1",
        name: "Tortilla española",
        description: "Con cebolla, poco hecha",
        price: 6.0,
        image_url: null,
        allergen_ids: [3],
        is_available: true,
        sort_order: 2,
        product_extras: [],
      },
    ],
  },
  {
    id: "cat-2",
    name: "Vinos",
    slug: "vinos",
    destination: "barra",
    icon: "🍷",
    sort_order: 2,
    parent_id: null,
    products: [
      {
        id: "prod-3",
        category_id: "cat-2",
        name: "Rioja Crianza",
        description: "Copa 15cl",
        price: 4.5,
        image_url: null,
        allergen_ids: [],
        is_available: true,
        sort_order: 1,
        product_extras: [],
      },
    ],
  },
];

/**
 * Intercepta las peticiones REST a Supabase que hace el frontend público del
 * menú y devuelve datos predecibles. Útil para tests que no quieren depender
 * de la base real.
 */
export async function mockSupabasePublic(
  page: Page,
  options: { settings?: MockSettings; categories?: MockCategory[] } = {}
) {
  const settings: MockSettings = options.settings ?? {};
  const categories = options.categories ?? DEFAULT_CATEGORIES;

  await page.route(/\/rest\/v1\/settings(\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { key: "maintenance_enabled", value: String(settings.maintenance_enabled ?? false) },
        {
          key: "maintenance_message",
          value:
            settings.maintenance_message ?? "Estamos cerrados temporalmente. ¡Volvemos muy pronto!",
        },
      ]),
    });
  });

  await page.route(/\/rest\/v1\/categories(\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(categories),
    });
  });
}
