import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ownerSpaRoute } from './owner-spa-route.mjs';

const project = resolve(import.meta.dirname, "..");
const root = resolve(project, process.env.BURGER_BUILD_OUTPUT_DIR || ".vercel/output");
const staticRoot = resolve(root, "static");

const config = JSON.parse(await readFile(resolve(root, "config.json"), "utf8"));

const policy = config.routes.find(
  route => route.src === "/(.*)" && route.headers?.["Content-Security-Policy"]
)?.headers["Content-Security-Policy"];

const filesystem = config.routes.findIndex(route => route.handle === "filesystem");
const beforeStaticFiles = config.routes.slice(0, filesystem);
assert.ok(filesystem >= 0 && beforeStaticFiles.some(route =>
  route.src === "/(.*)" && route.headers?.["Content-Security-Policy"] === policy && policy),
  "A CSP da vitrine deve ser aplicada antes de servir index.html.");
assert.ok(beforeStaticFiles.some(route => route.src === "/admin(?:/.*)?" &&
  /connect-src [^;]*https:\/\/api\.open-meteo\.com(?:;| )/.test(route.headers?.["Content-Security-Policy"] ?? "")),
  "O Owner precisa de acesso à previsão do tempo sob a política publicada.");

assert.ok(
  policy?.split(";").some(d => d.trim() === (process.env.BURGER_BUILD_GA4_MEASUREMENT_ID
    ? "script-src 'self' https://www.googletagmanager.com" : "script-src 'self'")),
  "A política CSP deve restringir scripts à mesma origem, com exceção GA4 somente sob configuração explícita."
);

assert.ok(
  config.routes.some(r => new RegExp(`^${r.src}$`).test("/menu") && r.dest === "/index.html"),
  "Rota da loja ausente."
);

assert.ok(
  config.routes.some(r => r.src === ownerSpaRoute && r.dest === "/admin/index.html"),
  "Rota do Owner React ausente."
);

const expectedApiOrigin = new URL(
  process.env.BURGER_BUILD_API_ORIGIN ||
  "https://the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net"
).origin;

assert.ok(
  config.routes.some(r => r.src === "/api/(.*)" && r.dest === `${expectedApiOrigin}/api/$1`),
  "Proxy de API nao corresponde a origem configurada."
);

const storefront = await readFile(resolve(staticRoot, "index.html"), "utf8");
const owner = await readFile(resolve(staticRoot, "admin/index.html"), "utf8");

assert.match(storefront, /id="root"/, "Entrada React da loja ausente.");
assert.match(owner, /id="root"/, "Entrada React do Owner ausente.");

const storefrontJs = /<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/.exec(storefront)?.[1];
assert.ok(storefrontJs, "JavaScript principal da loja ausente.");
assert.ok((await readFile(resolve(staticRoot, `.${storefrontJs}`))).length > 0);

const ownerJs = /<script\b[^>]*\bsrc="(\/admin\/assets\/[^"]+\.js)"/.exec(owner)?.[1];
const ownerCss = /<link\b[^>]*\bhref="(\/admin\/assets\/[^"]+\.css)"/.exec(owner)?.[1];

assert.ok(ownerJs, "JavaScript principal do Owner ausente.");
assert.ok(ownerCss, "CSS principal do Owner ausente.");

for (const asset of [ownerJs, ownerCss]) {
  assert.ok(
    (await readFile(resolve(staticRoot, `.${asset}`))).length > 0,
    `Asset do Owner ausente: ${asset}`
  );
}

assert.doesNotMatch(
  owner,
  /\/scripts\/admin\/(?:main|client|views)\.js/,
  "O HTML administrativo ainda referencia o legado."
);

console.log("Loja React, Owner React, assets e rotas validados.");

const artifactFiles = await readdir(root, { recursive: true });
const legacy = artifactFiles.filter(file =>
  /(?:^|[/\\])scripts[/\\]admin(?:[/\\]|$)|(?:^|[/\\])admin\.css$|(?:^|[/\\])simple-liquid-glass-owner\.js$/i.test(file)
);
assert.deepEqual(legacy, [], "O pacote contém arquivos do administrativo legado.");
const forbidden = artifactFiles.filter(
  file => /\.(?:db(?:-wal|-shm)?|sqlite3?|dll|pfx|p12|key|pem|ps1|sh|py)$/i.test(file) ||
    /(?:^|[/\\])(?:private\.dpapi\.json|\.env(?:\..*)?)$/i.test(file)
);

assert.deepEqual(forbidden, [], "O pacote contem arquivos privados proibidos.");

console.log("Pacote sem bancos, credenciais ou ferramentas privadas.");
