import { Page, Locator, expect } from "@playwright/test";

export class MesaPage {
  readonly page: Page;
  readonly tableBadge: Locator;
  readonly searchButton: Locator;
  readonly searchInput: Locator;
  readonly backToCategories: Locator;
  readonly cartFooter: Locator;
  readonly payButton: Locator;
  readonly maintenanceHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tableBadge = page.locator(".table-badge");
    this.searchButton = page.locator(".icon-btn").first();
    this.searchInput = page.getByPlaceholder(/buscar/i);
    this.backToCategories = page.locator(".back-btn");
    this.cartFooter = page.locator(".footer-cart");
    this.payButton = page.locator(".pay-btn-small");
    this.maintenanceHeading = page.getByRole("heading", { name: /fuera de servicio/i });
  }

  async goto(mesa: number | string) {
    await this.page.goto(`/${mesa}`);
  }

  async waitForMenuOrMaintenance() {
    // Espera a que desaparezca el loader
    await this.page.waitForSelector(".loading-screen", { state: "detached", timeout: 15_000 });
  }

  async openCategoryByIndex(index: number) {
    const card = this.page.locator(".cat-card").nth(index);
    await expect(card).toBeVisible();
    await card.click();
  }

  async addFirstProductToCart() {
    const addBtn = this.page.locator(".cat-add-btn").first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    // El modal de producto abre — confirmar
    const confirm = this.page.locator(".modal-add-btn");
    await expect(confirm).toBeVisible();
    await confirm.click();
  }
}
