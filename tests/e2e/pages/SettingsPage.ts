import { Page, Locator } from "@playwright/test";

export class SettingsPage {
  readonly page: Page;
  readonly toggleButton: Locator;
  readonly messageTextarea: Locator;
  readonly saveMessageButton: Locator;
  readonly statusValue: Locator;

  constructor(page: Page) {
    this.page = page;
    this.toggleButton = page.locator(".toggle-btn");
    this.messageTextarea = page.locator(".message-textarea");
    this.saveMessageButton = page.locator(".save-btn");
    this.statusValue = page.locator(".status-value");
  }

  async goto() {
    await this.page.goto("/admin/settings");
  }
}
