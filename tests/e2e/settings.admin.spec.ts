import { test, expect } from "@playwright/test";
import { SettingsPage } from "./pages/SettingsPage";

test.describe("Admin /settings — modo mantenimiento", () => {
  test("permite alternar el estado de la web", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    const initialText = await settings.statusValue.textContent();
    const initiallyOffline = /FUERA DE SERVICIO/i.test(initialText ?? "");

    await settings.toggleButton.click();

    // Tras el toggle, el estado debe invertirse
    await expect(settings.statusValue).toHaveText(
      initiallyOffline ? /EN LÍNEA/i : /FUERA DE SERVICIO/i,
      { timeout: 5000 }
    );

    // Volver al estado original para no dejar la web apagada tras el test
    await settings.toggleButton.click();
    await expect(settings.statusValue).toHaveText(
      initiallyOffline ? /FUERA DE SERVICIO/i : /EN LÍNEA/i,
      { timeout: 5000 }
    );
  });

  test("guarda el mensaje de fuera de servicio", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    const newMessage = `Test E2E ${Date.now()}`;
    await settings.messageTextarea.fill(newMessage);
    await settings.saveMessageButton.click();

    await expect(page.getByText(/¡guardado!/i)).toBeVisible({ timeout: 5000 });

    // Reload y verificar persistencia
    await page.reload();
    await expect(settings.messageTextarea).toHaveValue(newMessage);
  });
});
