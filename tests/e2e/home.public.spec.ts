import { test, expect } from "@playwright/test";
import { HomePage } from "./pages/HomePage";

test.describe("Home pública", () => {
  test("renderiza hero, CTA y features", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.heroTitle).toContainText(/experiencia/i);
    await expect(home.ctaButton).toBeVisible();
    await expect(home.ctaButton).toHaveAttribute("href", "/1");

    // Tres feature cards
    await expect(page.getByRole("heading", { name: /vinos seleccionados/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /tapas gourmet/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /café de especialidad/i })).toBeVisible();
  });

  test("CTA navega a /1 (mesa 1)", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.ctaButton.click();
    await expect(page).toHaveURL(/\/1$/);
  });

  test("5 clics sobre el logo redirigen al login admin", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.triggerAdminHotkey();
    await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 5000 });
  });
});
