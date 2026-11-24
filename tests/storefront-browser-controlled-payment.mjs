import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { resolveStaticFile } from "../scripts/homologation-static.mjs";
import { buildIsolatedPackage } from "./build-isolated-package.mjs";

const upstream = new URL(process.argv[2]);
const delivery = process.argv[3] === "delivery";
assert.equal(upstream.protocol, "http:");
assert.equal(upstream.hostname, "127.0.0.1");
assert.match(upstream.port, /^\d+$/);

const bundle = process.env.BURGER_BUILD_OUTPUT_DIR ? null : buildIsolatedPackage();
const staticRoot = join(process.env.BURGER_BUILD_OUTPUT_DIR ?? bundle.output, "static");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".webm": "video/webm", ".mp4": "video/mp4" };
const gateway = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, "http://127.0.0.1");
    if (pathname.startsWith("/api/") || pathname === "/__acceptance/approve") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const headers = request.headers["content-type"] ? { "content-type": request.headers["content-type"] } : {};
      const result = await fetch(new URL(pathname, upstream), {
        method: request.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "error", signal: AbortSignal.timeout(8000),
      });
      response.writeHead(result.status, { "Content-Type": result.headers.get("content-type") ?? "application/json" })
        .end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const { status, file } = await resolveStaticFile(staticRoot, pathname);
    if (!file) { response.writeHead(status).end(); return; }
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" })
      .end(await readFile(file));
  } catch {
    response.writeHead(502).end();
  }
});

let browser;
let step = "iniciar Chromium";
try {
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const origin = "http://127.0.0.1:" + gateway.address().port;
  browser = await chromium.launch({ channel: "chrome", args: [
    "--disable-background-networking", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const providerPage = "https://pagamento.sandbox.pagbank.com.br/checkout/CHEC_LOCAL";
  await page.route(providerPage, route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: '<a href="' + origin + '/menu?status=approved">Voltar à loja</a>',
  }));
  await page.route("https://viacep.com.br/**", route => route.fulfill({
    json: { cep: "38400-000", logradouro: "Rua Teste", bairro: "Centro", localidade: "Uberlândia" },
  }));

  step = "montar pedido com catálogo da API";
  await page.goto(origin + "/menu?forceOpen=true");
  await page.getByRole("button", { name: /^Ver cardápio completo$/i }).click();
  const approvedCatalog = process.env.TBH_BROWSER_APPROVED_CATALOG === "1";
  const menu = page.getByRole("dialog", { name: /^Escolha seu favorito\.$/i });
  if (approvedCatalog) {
    const selections = [
      ["SMASH BURGERS", "The Classic"], ["SMASH BURGERS", "Double Smash"],
      ["SMASH BURGERS", "Smokehouse BBQ"], ["ACOMPANHAMENTOS", "Loaded Fries"],
      ["BEBIDAS", "Coca-Cola Original"],
    ];
    for (const [category, name] of selections) {
      step = 'catálogo e sacola: ' + category + ' / ' + name;
      await menu.getByRole("tab", { name: new RegExp(category, "i") }).click();
      await menu.getByRole("button", { name: "Adicionar " + name, exact: true }).click();

    }
    step = 'abrir sacola e editar quantidades';
    await page.getByRole("button", { name: "Ver sacola", exact: true }).click();
    await page.getByRole("button", { name: "Aumentar quantidade de The Classic", exact: true }).click();
    await page.getByRole("button", { name: "Diminuir quantidade de The Classic", exact: true }).click();
    await page.getByRole("button", { name: "Remover Coca-Cola Original", exact: true }).click();
    await page.getByRole("button", { name: "Fechar pedido", exact: true }).click();
    await menu.getByRole("button", { name: "Adicionar Coca-Cola Original", exact: true }).click();
    await page.getByRole("button", { name: "Ver sacola", exact: true }).click();
    await page.route("**/api/orders", route => {
      const body = route.request().postDataJSON();
      return route.continue({ postData: JSON.stringify({
        ...body, total: 0.01,
        items: body.items.map(item => ({ ...item, unitPrice: 0.01 })),
      }) });
    });
    await page.screenshot({ path: "test-results/catalog-correction/cart-" + (delivery ? "delivery" : "pickup") + ".png" });
  } else {
    await menu.getByRole("button", { name: /^Adicionar O Praiano$/i }).click();
    await page.getByRole("button", { name: "Ver sacola", exact: true }).click();
  }
  if (process.env.TBH_BROWSER_CUSTOMIZATIONS === "1") {
    step = 'adicionais, observações e cupom';
    await page.locator(".checkout-extras").first().locator("summary").click();
    await page.getByLabel("Quantidade de Queijo Cheddar Extra para The Classic", { exact: true }).selectOption("1");
    await page.getByLabel("Observações para este produto", { exact: true }).first().fill("Sem cebola");
    await page.getByLabel("Cupom de desconto", { exact: true }).fill("BURGERTESTE10");
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Cupom válido" })).toBeVisible();
  }
  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.getByRole("radio", { name: delivery ? /^Entrega$/i : /^Retirada no local$/i }).check();
  await page.getByLabel(/^Nome completo\s*\*?$/i).fill("Cliente Sintético");
  await page.getByLabel("Celular com DDD").fill("11999990000");
  await page.getByRole("textbox", { name: /^E-mail$/i }).fill("customer@example.invalid");
  await page.getByLabel(/^CPF\s*\*?$/i).fill("52998224725");
  if (delivery) {
    await page.getByLabel(/^CEP\s*\*?$/i).fill("38400000");
    await page.getByRole("button", { name: /^Buscar CEP$/i }).click();
    await expect(page.getByLabel(/^Rua\s*\*?$/i)).toHaveValue("Rua Teste");
    await page.getByLabel(/^Número\s*\*?$/i).fill("10");
  }
  await page.getByRole("button", { name: /^Revisar pedido$/i }).click();
  await expect(page.getByRole("heading", { name: /^Revise seu pedido$/i })).toBeVisible();

  step = "checkout real e retorno ainda pendente";
  await page.getByRole("button", { name: /^Ir para pagamento$/i }).click();
  await expect(page).toHaveURL(providerPage);
  await page.getByRole("link", { name: "Voltar à loja", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Pagamento pendente$/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Pagamento pendente$/i })).toBeVisible();

  step = "confirmar somente após webhook sintético assinado";
  assert.equal((await context.request.post(origin + "/__acceptance/approve")).status(), 200);
  await page.getByRole("button", { name: /^Consultar pagamento$/i }).click();
  await expect(page.getByRole("heading", { name: /^Pagamento aprovado$/i })).toBeVisible();
  await mkdir("test-results/acceptance", { recursive: true });
  await page.screenshot({ path: "test-results/acceptance/checkout-controlled-" + (delivery ? "delivery" : "pickup") + ".png" });
  await page.getByRole("button", { name: /^Fazer novo pedido$/i }).click();
  await expect(page.getByRole("heading", { name: /^Pagamento aprovado$/i })).toHaveCount(0);
  console.log("Checkout Chromium: " + (delivery ? "entrega" : "retirada") + ", confirmação do backend após webhook sintético.");
} catch (error) {
  console.error("Ensaio Chromium interrompido em: " + step);
  if (error instanceof Error) console.error(error.name);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (gateway.listening) await new Promise(resolve => gateway.close(resolve));
  bundle?.cleanup();
}
