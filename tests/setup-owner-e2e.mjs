import { buildIsolatedPackage } from "./build-isolated-package.mjs";

export default function setupOwnerE2E() {
  if (process.env.BURGER_BUILD_OUTPUT_DIR) return;
  const { output, cleanup } = buildIsolatedPackage();
  process.env.BURGER_BUILD_OUTPUT_DIR = output;
  return cleanup;
}
