import { Page, Locator } from "@playwright/test";

export class AdminDashboardPage {
  readonly page: Page;
  readonly navDashboard: Locator;
  readonly navCategories: Locator;
  readonly navProducts: Locator;
  readonly navQr: Locator;
  readonly navSettings: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navDashboard = page.getByRole("link", { name: /dashboard/i });
    this.navCategories = page.getByRole("link", { name: /categorías/i });
    this.navProducts = page.getByRole("link", { name: /productos/i });
    this.navQr = page.getByRole("link", { name: /qr mesas/i });
    this.navSettings = page.getByRole("link", { name: /configuración/i });
    this.logoutButton = page.getByRole("button", { name: /salir/i });
  }

  async goto() {
    await this.page.goto("/admin");
  }
}
