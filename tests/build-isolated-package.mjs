import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

export function buildIsolatedPackage() {
  const temporaryRoot = resolve(tmpdir());
  const run = mkdtempSync(join(temporaryRoot, "tbh-playwright-build-"));
  const cleanup = () => {
    if (resolve(run, "..") !== temporaryRoot) throw new Error("Unexpected test build directory");
    rmSync(run, { recursive: true, force: true });
  };
  const env = {
    ...process.env,
    VITE_MAPTILER_KEY: "local-map-style-fixture",
    BURGER_BUILD_API_ORIGIN: "https://api.invalid",
    BURGER_BUILD_FRONTEND_DIR: join(run, "frontend"),
    BURGER_BUILD_OWNER_DIR: join(run, "owner"),
    BURGER_BUILD_OUTPUT_DIR: join(run, "package"),
  };
  try {
    for (const [folder, output] of [
      ["frontend", env.BURGER_BUILD_FRONTEND_DIR],
      ["owner-ui", env.BURGER_BUILD_OWNER_DIR],
    ]) {
      const cwd = join(root, folder);
      execFileSync(process.execPath, [join(cwd, "node_modules/vite/bin/vite.js"), "build", "--outDir", output], {
        cwd, env, stdio: "inherit",
      });
    }
    for (const script of ["package-official-frontend.mjs", "verify-built-output.mjs"]) {
      execFileSync(process.execPath, [join(root, "scripts", script)], { cwd: root, env, stdio: "inherit" });
    }
    return { output: env.BURGER_BUILD_OUTPUT_DIR, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
