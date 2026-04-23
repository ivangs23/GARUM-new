import { Page, Locator } from "@playwright/test";

export class AdminLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder("admin@garum.es");
    this.passwordInput = page.getByPlaceholder("••••••••");
    this.submitButton = page.getByRole("button", { name: /acceder al panel/i });
    this.errorMessage = page.locator(".error-msg");
  }

  async goto() {
    await this.page.goto("/admin/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
