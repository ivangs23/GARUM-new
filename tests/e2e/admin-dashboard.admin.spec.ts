import { test, expect } from "@playwright/test";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";

test.describe("Admin dashboard — autenticado", () => {
  test("el dashboard carga y muestra la navegación lateral", async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(dashboard.navDashboard).toBeVisible();
    await expect(dashboard.navCategories).toBeVisible();
    await expect(dashboard.navProducts).toBeVisible();
    await expect(dashboard.navQr).toBeVisible();
    await expect(dashboard.navSettings).toBeVisible();
    await expect(dashboard.logoutButton).toBeVisible();
  });

  test("navegar a categorías, productos, QR y settings sin perder sesión", async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();

    await dashboard.navCategories.click();
    await expect(page).toHaveURL(/\/admin\/categories/);

    await dashboard.navProducts.click();
    await expect(page).toHaveURL(/\/admin\/products/);

    await dashboard.navQr.click();
    await expect(page).toHaveURL(/\/admin\/qr/);

    await dashboard.navSettings.click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: /configuración/i })).toBeVisible();
  });

  test("el proxy protege /admin sin sesión (redirección al login)", async ({ browser }) => {
    // Contexto fresco sin storageState → debería redirigir
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
    await context.close();
  });
});
