import { defineConfig, devices } from "@playwright/test";
import { playwrightOutput } from "./tests/playwright-output.js";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  ...playwrightOutput("integration"),
  globalSetup: "./tests/setup-owner-e2e.mjs",
  timeout: 30_000,
  use: {
    actionTimeout: 8000,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile", use: { ...devices["Pixel 5"], channel: "chrome" } },
    ...(process.env.TBH_MULTI_BROWSER === '1' ? [
      { name: 'edge', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
      { name: 'brave', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.TBH_BRAVE_EXECUTABLE || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe' } } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'], browserName: 'firefox' as const } },
    ] : []),
    ...(process.env.TBH_TEST_WEBKIT === "1" ? [{
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        launchOptions: { executablePath: process.env.TBH_WEBKIT_EXECUTABLE },
      },
    }] : []),
  ],
});
