import { test, expect } from "@playwright/test";
import { AdminLoginPage } from "./pages/AdminLoginPage";

test.describe("Admin login — validación visual", () => {
  test("renderiza formulario con los campos esperados", async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto();

    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
    await expect(page.getByText(/panel de administración/i)).toBeVisible();
  });

  test("credenciales inválidas muestran mensaje de error", async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto();
    await login.login("nohaynadieaqui@garum.test", "wrong-password-xyz");

    await expect(login.errorMessage).toBeVisible({ timeout: 10_000 });
    await expect(login.errorMessage).toContainText(/credenciales/i);
  });

  test("volver a la web desde el login funciona", async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto();

    await page.getByRole("link", { name: /volver a la web/i }).click();
    await expect(page).toHaveURL("/");
  });
});
