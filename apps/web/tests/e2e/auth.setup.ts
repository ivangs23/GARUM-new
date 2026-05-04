import { test as setup, expect } from "@playwright/test";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import path from "path";
import fs from "fs";

const authFile = path.resolve(__dirname, ".auth/admin.json");

setup("authenticate admin", async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    setup.skip(
      true,
      "Saltado: define TEST_ADMIN_EMAIL y TEST_ADMIN_PASSWORD en .env.local para correr los tests de admin."
    );
  }

  const login = new AdminLoginPage(page);
  await login.goto();
  await login.login(email!, password!);

  // El login redirige a /admin — esperamos a que cargue el dashboard
  await page.waitForURL("/admin", { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Guarda la sesión en disco
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
