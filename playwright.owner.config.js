import { defineConfig } from "@playwright/test";
import { playwrightOutput } from "./tests/playwright-output.js";

export default defineConfig({
  ...playwrightOutput("owner-react"),
  testDir: "./tests/e2e",
  testMatch: "owner-react.*.spec.js",
  globalSetup: "./tests/setup-owner-e2e.mjs",
  use: { channel: "chrome", serviceWorkers: "block", colorScheme: "light", reducedMotion: "reduce", actionTimeout: 6000 },
});
