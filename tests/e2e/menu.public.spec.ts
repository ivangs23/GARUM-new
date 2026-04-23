import { test, expect } from "@playwright/test";
import { MesaPage } from "./pages/MesaPage";
import { mockSupabasePublic } from "./fixtures/supabase-mocks";

test.describe("Menú público (mesa 1) — con Supabase mockeado", () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabasePublic(page);
  });

  test("muestra el badge de mesa y la lista de categorías", async ({ page }) => {
    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await expect(mesa.tableBadge).toContainText("1");
    await expect(page.getByRole("heading", { name: "Tapas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vinos" })).toBeVisible();
  });

  test("al clicar una categoría se muestran sus productos", async ({ page }) => {
    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await mesa.openCategoryByIndex(0); // Tapas

    await expect(mesa.backToCategories).toBeVisible();
    await expect(page.locator(".cat-product-card").first()).toBeVisible();
    await expect(page.getByText("Croquetas de jamón")).toBeVisible();
  });

  test("añadir un producto al carrito actualiza el footer", async ({ page }) => {
    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await mesa.openCategoryByIndex(0);
    await mesa.addFirstProductToCart();

    await expect(mesa.cartFooter).toBeVisible();
    await expect(mesa.cartFooter).toContainText(/8[.,]50/); // precio croquetas
    await expect(mesa.payButton).toBeEnabled();
  });

  test("búsqueda filtra productos en toda la carta", async ({ page }) => {
    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await mesa.searchButton.click();
    await mesa.searchInput.fill("tortilla");

    // Debounce de 300ms
    await expect(page.getByText("Tortilla española")).toBeVisible({ timeout: 2000 });

    // No debería aparecer un producto de otra categoría
    await expect(page.getByText("Rioja Crianza")).toHaveCount(0);
  });

  test("búsqueda sin resultados muestra estado vacío", async ({ page }) => {
    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await mesa.searchButton.click();
    await mesa.searchInput.fill("zzz-no-existe");

    await expect(page.getByText(/sin resultados/i)).toBeVisible({ timeout: 2000 });
  });
});
