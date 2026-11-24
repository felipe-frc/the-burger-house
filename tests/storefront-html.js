import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Exercise the actual built server, without relying on the retired HTML entrypoints.
export function storefrontHtml(path = "/") {
  return execFileSync(process.execPath, [resolve("scripts/render-built-page.mjs"), path], {
    encoding: "utf8",
    windowsHide: true,
  });
}
