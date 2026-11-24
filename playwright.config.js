import { defineConfig, devices } from "@playwright/test";
import { playwrightOutput } from "./tests/playwright-output.js";

export default defineConfig({
  ...playwrightOutput("e2e"),
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.js",
  timeout: 30000,
  expect: {
    timeout: 8000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: "node scripts/serve-built-local.mjs",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
});
