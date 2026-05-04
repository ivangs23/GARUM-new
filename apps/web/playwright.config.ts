import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4320);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Tests públicos que no necesitan sesión
    {
      name: "public",
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public-mobile",
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices["iPhone 14"] },
    },

    // Setup: login admin → guarda storageState en disco
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Tests de admin que requieren sesión autenticada
    {
      name: "admin",
      testMatch: /.*\.admin\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/admin.json",
      },
    },
  ],

  webServer: {
    // Producción: evita EMFILE del file-watcher y acelera los runs
    command: `next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
