import { Page, Locator } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly heroTitle: Locator;
  readonly ctaButton: Locator;
  readonly logo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heroTitle = page.getByRole("heading", { level: 2 });
    this.ctaButton = page.getByRole("link", { name: /VER CARTA COMPLETA/i });
    this.logo = page.getByAltText("Garum Vinoteca").first();
  }

  async goto() {
    await this.page.goto("/");
  }

  async triggerAdminHotkey() {
    // 5 clics rápidos sobre el logo → redirige a /admin/login
    for (let i = 0; i < 5; i++) {
      await this.logo.click({ force: true });
    }
  }
}
