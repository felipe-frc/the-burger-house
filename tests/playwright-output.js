import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function playwrightOutput(suite) {
  const root = fileURLToPath(new URL("../test-results/playwright-runs/", import.meta.url));
  // Workers reload the config. Share the runner's directory within this invocation.
  const key = `TBH_PLAYWRIGHT_${suite.toUpperCase()}_RUN`;
  mkdirSync(root, { recursive: true });
  const run = process.env.TEST_WORKER_INDEX !== undefined && process.env[key]
    ? process.env[key]
    : mkdtempSync(join(root, `${suite}-`));
  process.env[key] = run;
  return {
    outputDir: join(run, "artifacts"),
    reporter: [["list"], ["json", { outputFile: join(run, "report.json") }]],
  };
}
