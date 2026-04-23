import { test, expect } from "@playwright/test";
import { MesaPage } from "./pages/MesaPage";
import { mockSupabasePublic } from "./fixtures/supabase-mocks";

test.describe("Modo mantenimiento — frontend público", () => {
  test("con maintenance_enabled=true se muestra el cartel de fuera de servicio", async ({
    page,
  }) => {
    await mockSupabasePublic(page, {
      settings: {
        maintenance_enabled: true,
        maintenance_message: "Volvemos el lunes a las 13:00",
      },
    });

    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await expect(mesa.maintenanceHeading).toBeVisible();
    await expect(page.getByText("Volvemos el lunes a las 13:00")).toBeVisible();

    // El menú y el navbar no deben estar presentes
    await expect(mesa.tableBadge).toHaveCount(0);
    await expect(mesa.cartFooter).toHaveCount(0);
  });

  test("con maintenance_enabled=false se muestra la carta normal", async ({ page }) => {
    await mockSupabasePublic(page, {
      settings: { maintenance_enabled: false },
    });

    const mesa = new MesaPage(page);
    await mesa.goto(1);
    await mesa.waitForMenuOrMaintenance();

    await expect(mesa.maintenanceHeading).toHaveCount(0);
    await expect(mesa.tableBadge).toBeVisible();
  });
});
