import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ownerSpaRoute } from './owner-spa-route.mjs';

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, process.env.BURGER_BUILD_OUTPUT_DIR || '.vercel/output', 'config.json');
if (!process.env.BURGER_BUILD_API_ORIGIN) throw new Error('Set BURGER_BUILD_API_ORIGIN explicitly before finalizing the build.');
const apiTarget = new URL(process.env.BURGER_BUILD_API_ORIGIN);
if (apiTarget.protocol !== 'https:' || apiTarget.username || apiTarget.password || apiTarget.pathname !== '/' || apiTarget.search || apiTarget.hash)
  throw new Error('The build API target must be an explicit HTTPS origin.');
const apiOrigin = apiTarget.origin;
const config = JSON.parse(await readFile(configPath, "utf8"));
const generatedRoutes = Array.isArray(config.routes) ? config.routes : [];
const storefrontHeaders = generatedRoutes.filter(route => route.src === "/(.*)" &&
  route.continue && route.headers?.["Content-Security-Policy"]);

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

config.routes = [
  ...storefrontHeaders,
  { src: "/(.*)", headers: securityHeaders, continue: true },
  { src: "/(?:privacy|terms|cancellation|rights)\\.html", headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }, continue: true },
  { src: "/admin/courier/[1-9][0-9]*/?", headers: {
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Referrer-Policy": "no-referrer",
  }, continue: true },
  {
    src: "/admin(?:/.*)?",
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://api.maptiler.com; worker-src 'self' blob:; connect-src 'self' https://api.maptiler.com https://cdn.maptiler.com https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    },
    continue: true,
  },
  {
    src: "/api/(?:admin(?:/.*)?|courier(?:/.*)?|privacy(?:/.*)?|products|orders(?:/.*)?|payments(?:/.*)?|checkout(?:/.*)?)",
    headers: { "Cache-Control": "no-store, private" },
    continue: true,
  },
  { src: "/api/(.*)", dest: `${apiOrigin}/api/$1` },
  { handle: "filesystem" },
  { src: ownerSpaRoute, dest: "/admin/index.html" },
  ...generatedRoutes.filter(route => !storefrontHeaders.includes(route) && route.handle !== "filesystem"),
];

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("Rotas, proxy e cabeçalhos incorporados ao Vercel Build Output API.");
