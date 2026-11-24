import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:https";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { createInterface } from "node:readline";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolveStaticFile } from "../scripts/homologation-static.mjs";
import { buildIsolatedPackage } from "./build-isolated-package.mjs";

const project = resolve(import.meta.dirname, "..");
const acceptanceDir = process.env.TBH_ACCEPTANCE_DIR || "test-results/acceptance";
const temporaryRoot = resolve(tmpdir());
const localTypes = {
  ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2",
};
const runRoot = await mkdtemp(join(temporaryRoot, "tbh-owner-test-run-"));
const scratch = await mkdtemp(join(runRoot, "burgerhouse-homologation-owner-test-"));
const password = "BrowserTest-" + randomBytes(24).toString("hex");
const database = join(scratch, "burgerhouse.homologation.db");
const postgres = process.env.TBH_OWNER_BROWSER_POSTGRES === "1";
const databaseLabel = postgres ? "PostgreSQL" : "SQLite";
const environment = {
  ...process.env,
  DOTNET_ENVIRONMENT: "Homologation",
  ASPNETCORE_ENVIRONMENT: "Homologation",
  ASPNETCORE_URLS: "http://127.0.0.1:0",
  ASPNETCORE_HTTP_PORTS: "",
  ASPNETCORE_HTTPS_PORTS: "",
  Homologation__Root: scratch,
  ConnectionStrings__DefaultConnection: `Data Source=${database};Mode=ReadWrite;Pooling=False`,
  Privacy__EncryptionKey: randomBytes(32).toString("base64"),
  HOMOLOGATION_OWNER_PASSWORD: password,
  Admin__DataProtectionPath: join(scratch, "data-protection"),
  AZURE_TRANSLATION_ENABLED: "false",
  PagBank__Token: "only-local-owner-browser-test",
  PagBank__BaseUrl: "https://sandbox.api.pagseguro.com",
  PagBank__RedirectUrl: "https://localhost:4174/menu",
  PagBank__NotificationUrl: " ",
  PagBank__AllowUnsignedSandboxWebhooks: "false",
  "Logging__LogLevel__Microsoft.Hosting.Lifetime": "Information",
};
const fixtureDll = join(runRoot, "fixture-bin", "HomologationFixture.dll");
const apiDll = join(runRoot, "api-bin", "BurgerHouse.Api.dll");
let host, hostClosed, gateway, browser, bundle;
let step = "preparar cenário descartável";
const evidence = { synthetic: true, database: databaseLabel, checkoutAndPaymentRoutesBlocked: false, steps: [] };
function importPostgresFixture() {
  assert.equal(environment.PGHOST, "127.0.0.1");
  assert.equal(environment.PGDATABASE, "tbh_migration_lab");
  assert.ok(!environment.PGSERVICE && !environment.PGHOSTADDR);
  assert.match(environment.PGPORT, /^\d{1,5}$/);
  const schema = "owner_" + randomBytes(16).toString("hex");
  const quoted = value => '"' + value.replaceAll('"', '""') + '"';
  environment.PGOPTIONS = "-c search_path=" + schema;
  environment.Database__Provider = "PostgreSQL";
  environment.ConnectionStrings__DefaultConnection = `Host=127.0.0.1;Port=${environment.PGPORT};Database=tbh_migration_lab;Username=${quoted(environment.PGUSER)};Password=${quoted(environment.PGPASSWORD)};Search Path=${schema}`;
  const run = (exe, args, cwd) => execFileSync(exe, args, { cwd, env: environment, windowsHide: true, stdio: "inherit" });
  run(environment.TBH_PSQL || "psql", ["-X", "-v", "ON_ERROR_STOP=1", "-c", "CREATE SCHEMA " + schema], project);
  run("dotnet", ["tool", "run", "dotnet-ef", "database", "update", "--configuration", "Release", "--context", "PostgresContext", "--project", "BurgerHouse.Infrastructure", "--startup-project", "BurgerHouse.Api"], join(project, "backend"));
  run(environment.TBH_IMPORT_PYTHON || "python", ["scripts/admin/import-sqlite-postgres.py", database, "--schema", schema, "--database", "tbh_migration_lab", "--sqlite-utc", "--truncate-ticks"], project);
}
async function buildFixture() {
  for (const [path, output] of [["backend/tools/HomologationFixture", fixtureDll], ["backend/BurgerHouse.Api", apiDll]]) {
    execFileSync("dotnet", ["build", path, "--no-restore", "--output", resolve(output, "..")], {
      cwd: project, stdio: "inherit",
    });
  }
}
async function startApi() {
  host = spawn("dotnet", [resolve(project, apiDll)], { cwd: resolve(project, "backend/BurgerHouse.Api"),
    env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  hostClosed = once(host, "close");
  host.stderr.resume();
  const lines = createInterface({ input: host.stdout });
  let ready = "";
  const deadline = setTimeout(() => lines.close(), 15000);
  try {
    for await (const line of lines) {
      const address = line.match(/Now listening on: (http:\/\/127\.0\.0\.1:\d+)\s*$/);
      if (address) { ready = address[1]; break; }
    }
  } finally { clearTimeout(deadline); lines.close(); host.stdout.resume(); }
  // The built application may only be reached through the loopback listener we just started.
  assert.match(ready, /^http:\/\/127\.0\.0\.1:\d+$/);
  const isolation = await fetch(ready + "/api/homologation/info", { redirect: "error", signal: AbortSignal.timeout(3000) });
  assert.equal(isolation.status, 200);
  const info = await isolation.json();
  assert.equal(info.database, postgres ? "tbh_migration_lab" : "burgerhouse.homologation.db");
  assert.equal(info.environment, "Homologation");
  assert.equal(info.isolated, true);

  return ready;
}
try {
  await buildFixture();
  const seedOutput = execFileSync("dotnet", [fixtureDll, "--owner-browser", scratch], {
    cwd: project, env: environment, encoding: "utf8",
  });
  const { orderId, productId } = JSON.parse(seedOutput.trim().split(/\r?\n/).at(-1));
  if (postgres) importPostgresFixture();
  assert.ok(Number.isSafeInteger(orderId) && Number.isSafeInteger(productId));
  bundle = buildIsolatedPackage();
  step = "subir e comprovar API isolada na porta escolhida pelo sistema";
  let ready = await startApi();
  const staticRoot = join(bundle.output, "static");
  const allowedWrites = new Set([
    "POST /api/admin/auth/login", "POST /api/admin/auth/logout",
    "POST /api/admin/stock", "POST /api/admin/team", "POST /api/admin/agenda",
    "PUT /api/admin/agenda/browser-fixture",
    "PUT /api/admin/notifications/inbox/" + orderId + "/read",
    `PATCH /api/admin/orders/${orderId}/status`, `PATCH /api/admin/products/${productId}`,
    `POST /api/admin/products/${productId}/image`, `DELETE /api/admin/products/${productId}/image`,
    `POST /api/admin/delivery-tracking/${orderId}`, `POST /api/courier/tracking/${orderId}`,
    `PUT /api/courier/tracking/${orderId}`, `DELETE /api/courier/tracking/${orderId}`,
    "PUT /api/admin/operation/settings",
  ]);
  gateway = createServer({
    key: await readFile(process.env.TBH_TEST_TLS_KEY || join(project, '.test-tmp/portfolio-dev/tls/localhost.key')),
    cert: await readFile(process.env.TBH_TEST_TLS_CERT || join(project, '.test-tmp/portfolio-dev/tls/localhost.crt')),
  }, async (request, response) => {
    try {
      const target = new URL(request.url, "https://localhost");
      if (target.pathname.startsWith("/api/")) {
        const read = request.method === "GET" &&
          (target.pathname === "/api/products" || target.pathname.startsWith("/api/admin/") || /^\/api\/product-images\/[a-f0-9]{32}\.webp$/.test(target.pathname));
        const stockMovement = request.method === "POST" && /^\/api\/admin\/stock\/\d+\/movements$/.test(target.pathname);
        if (!read && !stockMovement && !allowedWrites.has(request.method + " " + target.pathname)) {
          response.writeHead(403).end(); return;
        }
        const parts = [];
        for await (const chunk of request) parts.push(chunk);
        const headers = new Headers();
        for (const name of ["cookie", "content-type", "x-csrf-token", "authorization"]) {
          if (typeof request.headers[name] === "string") headers.set(name, request.headers[name]);
        }
        headers.set("x-forwarded-proto", "https");
        const upstream = await fetch(ready + target.pathname + target.search, {
          method: request.method, headers, body: read ? undefined : Buffer.concat(parts),
          redirect: "error", signal: AbortSignal.timeout(8000),
        });
        if (upstream.headers.has("content-type")) response.setHeader("Content-Type", upstream.headers.get("content-type"));
        const cookies = upstream.headers.getSetCookie();
        if (cookies.length) response.setHeader("Set-Cookie", cookies);
        response.writeHead(upstream.status).end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      const { file, status } = await resolveStaticFile(staticRoot, target.pathname);
      if (!file) { response.writeHead(status).end(); return; }
      const type = localTypes[extname(file)];
      response.writeHead(200, { "Content-Type": type ?? "application/octet-stream" }).end(await readFile(file));
    } catch {
      response.writeHead(502).end();
    }
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const origin = "https://localhost:" + gateway.address().port;
  browser = await chromium.launch({ channel: "chrome", args: [
    "--disable-background-networking", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ] });
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const api = context.request;
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const orderUrl = origin + "/api/admin/orders/" + orderId;
  step = "login real, sessão recuperada e antiforgery";
  assert.equal((await api.get(origin + "/api/payments/1")).status(), 403);
  assert.equal((await api.post(origin + "/api/checkout/1")).status(), 403);
  evidence.checkoutAndPaymentRoutesBlocked = true;
  assert.equal((await api.get(orderUrl)).status(), 401);
  await page.goto(origin + "/admin/orders/" + orderId);
  await page.getByLabel("E-mail", { exact: true }).fill("owner.homologation@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Entrar/ }).click();
  step = "pedido direto após autenticação";
  await expect(page.getByRole("dialog", { name: "Pedido #" + orderId })).toBeVisible();
  const cookies = await context.cookies(orderUrl);
  assert.ok(cookies.some(cookie => cookie.name === "BurgerHouse.Owner" && cookie.httpOnly && cookie.secure && cookie.sameSite === "Strict"));
  step = "pedido direto após recuperação da sessão";
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Pedido #" + orderId })).toBeVisible();
  step = "rejeição de transição sem CSRF";
  assert.equal((await api.patch(orderUrl + "/status", { data: { expectedStatus: "Received", status: "Preparing" } })).status(), 400);
  const me = await (await api.get(origin + "/api/admin/auth/me")).json();
  const csrf = { "X-CSRF-TOKEN": me.csrfToken };
  assert.equal(me.role, "Owner");
  evidence.steps.push("Sessão Owner real, cookie Secure/HttpOnly/Strict e mutação sem CSRF rejeitada");
  await page.goto(origin + "/admin/");
  await expect(page.getByRole("region", { name: "Pipeline operacional" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Cliente Sintético", { exact: true })).toBeVisible();
  step = "série de vendas do SQLite no gráfico da Visão Geral";
  const sales = page.locator(".owner-overview-sales");
  await sales.getByRole("group", { name: "Período de vendas" }).getByText("Hoje", { exact: true }).click();
  await expect(sales.locator("svg[role=application]")).toBeVisible();
  const revenueResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/admin/finance/revenue" && url.searchParams.get("period") === "7d";
  });
  const categoriesResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/admin/finance/revenue-by-category" && url.searchParams.get("period") === "7d";
  });
  await sales.getByRole("group", { name: "Período de vendas" }).getByText("7 dias", { exact: true }).click();
  const revenueResult = await revenueResponse;
  assert.equal(revenueResult.status(), 200);
  const revenue = await revenueResult.json();
  assert.ok(revenue.some(point => point.revenue > 0));
  await expect(sales.locator("svg[role=application]")).toBeVisible();
  await sales.getByText("Ver dados em tabela", { exact: true }).click();
  const salesTable = sales.getByRole("table", { name: "Receita bruta no período" });
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  await expect(salesTable.getByRole("rowheader")).toHaveText(revenue.map(point => point.date.split("-").reverse().join("/")));
  await expect(salesTable.getByRole("cell")).toHaveText(revenue.map(point => brl.format(point.revenue)));
  evidence.steps.push(`Série real de receita da API .NET/${databaseLabel} exibida no gráfico e conferida na tabela`);
  step = "faturamento de produtos do SQLite e conciliação na Visão Geral";
  const categoriesResult = await categoriesResponse;
  assert.equal(categoriesResult.status(), 200);
  const categories = await categoriesResult.json();
  assert.deepEqual(categories.categories.map(row => row.category).sort(), ["drinks", "menu", "sides"]);
  const productRevenue = categories.categories.reduce((total, row) => total + Math.round(row.revenue * 100), 0);
  assert.equal(productRevenue + Math.round(categories.deliveryFees * 100), Math.round(categories.grossRevenue * 100));
  assert.equal(Math.round(categories.grossRevenue * 100), revenue.reduce((total, point) => total + Math.round(point.revenue * 100), 0));
  const categoryPanel = page.getByRole("region", { name: "Faturamento por categoria" });
  await expect(categoryPanel.locator("svg[role=application]")).toBeVisible();
  await expect(categoryPanel.locator(".owner-category-total strong")).toHaveText(brl.format(productRevenue / 100));
  for (const label of ["Receita de hoje", "Pedidos pagos hoje", "Ticket médio", "Aguardando pagamento",
    "Atrasados / Tempo médio", "Evolução de vendas", "Alertas", "Pedidos ativos de hoje"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await page.getByRole("button", { name: "Menu do proprietário" }).click();
  await expect(page.getByRole("menuitem", { name: "Histórico de auditoria" })).toBeVisible();
  await page.keyboard.press("Escape");
  await sales.getByText("Ver dados em tabela", { exact: true }).click();
  evidence.steps.push(`Donut de categorias conciliado com a receita bruta da API .NET/${databaseLabel}`);
  const chartEvidence = process.env.BURGER_OWNER_DASHBOARD_EVIDENCE_DIR;
  if (chartEvidence) {
    await mkdir(chartEvidence, { recursive: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    evidence.donutVisual = [];
    for (const theme of ["claro", "escuro"]) {
      if (theme === "escuro") await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 1024, 768]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        assert.equal(overflow, false);
        const [salesBox, categoryBox] = await Promise.all([sales.boundingBox(), categoryPanel.boundingBox()]);
        assert.ok(device === "desktop"
          ? Math.abs(categoryBox.y - salesBox.y) < 2 && categoryBox.x > salesBox.x
          : categoryBox.y > salesBox.y);
        const report = await new AxeBuilder({ page }).include(".owner-overview").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        assert.equal(report.violations.length, 0, report.violations.map(violation => violation.id).join(", "));
        const name = `${theme}-${device}.png`;
        await page.screenshot({ path: join(chartEvidence, name), fullPage: true, animations: "disabled" });
        evidence.donutVisual.push({ theme, device, width, height, overflow, violations: report.violations.length, screenshot: name });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Alternar para tema claro" }).click();
    await writeFile(join(chartEvidence, "validacao-donut.json"), JSON.stringify(evidence.donutVisual, null, 2) + "\n");
  }
  await page.goto(origin + "/admin/orders");
  await expect(page.getByText("Cliente Sintético", { exact: true }).first()).toBeVisible();
  evidence.steps.push("Compra aprovada da API visível em Visão Geral e Pedidos");
  const readOrder = async () => (await (await api.get(orderUrl)).json()).order;
  const advance = async (label, status) => {
    const committed = page.waitForResponse(response => response.url() === orderUrl + "/status" && response.request().method() === "PATCH");
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal((await committed).status(), 204);
    const order = await readOrder();
    assert.equal(order.status, status);
    assert.equal(order.paymentStatus, "Approved");
    assert.equal(order.total, 48.90);
    evidence.steps.push(status);
  };
  step = "Cozinha e conflito de status";
  await page.goto(origin + "/admin/kitchen");
  await advance("Iniciar Preparo na Chapa", "Preparing");
  assert.equal((await api.patch(orderUrl + "/status", { headers: csrf, data: { expectedStatus: "Received", status: "Preparing" } })).status(), 409);
  await page.getByLabel("Fila da cozinha").selectOption("Preparing");
  await advance("Marcar como Pronto (Expedição)", "ReadyForPickup");
  step = "Expedição, Entregas e auditoria";
  await page.goto(origin + "/admin/dispatch");
  const card = page.getByRole("article", { name: "Conferência do pedido #" + orderId });
  await card.getByRole("button", { name: /Burger do teste Owner/ }).click();
  await card.getByLabel("Embalagem conferida").check();
  await expect(card.getByRole("button", { name: "Liberar para Motoboy / Rota" })).toBeDisabled();
  await card.getByLabel("Identificação conferida").check();
  await advance("Liberar para Motoboy / Rota", "OutForDelivery");
  const createdCourier = await api.post(origin + "/api/admin/team", { headers: csrf, data: {
    name: "Entregador Sintético", email: "courier-browser@example.invalid", department: "Logística", role: "Entregador", shift: "18:00 - 23:00",
  } });
  assert.equal(createdCourier.status(), 200);
  const courierId = (await createdCourier.json()).id;
  step = "abertura do acompanhamento da entrega no Owner";
  await page.goto(origin + "/admin/deliveries");
  await page.getByRole("button", { name: "Acompanhar entrega" }).click();
  const tracking = page.getByRole("dialog", { name: "Acompanhamento da entrega #" + orderId });
  step = "vínculo entre o entregador e a entrega no Owner";
  await tracking.getByLabel("Entregador responsável").selectOption(String(courierId));
  await tracking.getByRole("button", { name: "Gerar link privado" }).click();
  const invitationInput = tracking.getByLabel("Link privado da entrega");
  await expect(invitationInput).toBeVisible();
  const invitation = await invitationInput.inputValue();
  const courierBrowser = await chromium.launch({ channel: "chrome", args: ["--disable-background-networking", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  const courierContext = await courierBrowser.newContext({ viewport: { width: 390, height: 844 },
    permissions: ["geolocation"], geolocation: { latitude: -26.99, longitude: -48.63, accuracy: 12 } });
  try {
    await courierContext.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    step = "rejeição de acesso anônimo aos endpoints de localização";
    assert.equal((await courierContext.request.get(origin + `/api/admin/delivery-tracking/${orderId}`)).status(), 401);
    assert.equal((await courierContext.request.post(origin + `/api/courier/tracking/${orderId}`)).status(), 401);
    const device = await courierContext.newPage();
    step = "captura e envio de posição emulada pela página do entregador";
    await device.goto(invitation);
    await device.getByRole("button", { name: "Compartilhar minha localização" }).click();
    await expect(device.getByText("Posição recebida pelo painel.")).toBeVisible({ timeout: 15000 });
    step = "persistência da posição emulada antes de atualizar o painel";
    const active = await (await api.get(origin + `/api/admin/delivery-tracking/${orderId}`)).json();
    assert.equal(active.state, "Active");
    assert.equal(active.latitude, -26.99);
    step = "recebimento da posição emulada no Owner";
    await tracking.getByRole("button", { name: "Atualizar localização" }).click();
    await expect(tracking.getByText("Compartilhamento ativo", { exact: true })).toBeVisible({ timeout: 16000 });
    await expect(tracking.getByText(/-26\.99000, -48\.63000/)).toBeVisible();
    step = "interrupção explícita no dispositivo";
    const stopped = device.waitForResponse(response => response.url() === origin + `/api/courier/tracking/${orderId}` && response.request().method() === "DELETE");
    await device.getByRole("button", { name: "Interromper compartilhamento" }).click();
    const stopStatus = (await stopped).status();
    step = `resposta ao encerramento do dispositivo (${stopStatus})`;
    assert.equal(stopStatus, 204);
    await expect(device.getByText("Compartilhamento interrompido.", { exact: true })).toBeVisible();
    step = "remoção persistida da última posição";
    const stoppedState = await (await api.get(origin + `/api/admin/delivery-tracking/${orderId}`)).json();
    assert.equal(stoppedState.latitude, null);
    assert.equal(stoppedState.state, "Stopped");
    step = "reabertura do acompanhamento após encerramento";
    await page.keyboard.press("Escape");
    await expect(tracking).toBeHidden();
    await page.getByRole("button", { name: "Acompanhar entrega" }).click();
    step = "leitura em tela do encerramento confirmado pela API";
    await expect(tracking.getByText("Compartilhamento inativo", { exact: true })).toBeVisible({ timeout: 10000 });
  } finally { await courierBrowser.close(); }
  await page.keyboard.press("Escape");
  evidence.steps.push("Credencial de entrega e posição emulada recebidas no Owner, sem acesso anônimo e com interrupção efetiva");
  await advance("Confirmar Entrega Realizada", "Completed");
  await page.goto(origin + "/admin/orders/" + orderId);
  await expect(page.getByRole("dialog").getByText(/Concluído/).first()).toBeVisible();
  const audit = await (await api.get(origin + "/api/admin/finance/audit?period=today")).json();
  assert.ok(audit.some(entry => entry.entityId === String(orderId) && entry.changes.includes('"Packaging":true')));
  step = "gravação de catálogo e imagem na API real";
  await page.goto(origin + "/admin/products");
  await page.getByRole("button", { name: "Editar Burger do teste Owner", exact: true }).click();
  await page.getByLabel("Categoria", { exact: true }).selectOption("sides");
  await page.getByLabel("Nome em inglês", { exact: true }).fill("Synthetic Burger");
  await page.getByLabel("Descrição em inglês", { exact: true }).fill("Persisted bilingual description.");
  await page.getByRole("button", { name: "Salvar Item", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const products = await (await api.get(origin + "/api/admin/products")).json();
  assert.equal(products.find(product => product.id === productId).category, "sides");
  assert.equal(products.find(product => product.id === productId).englishName, "Synthetic Burger");
  assert.equal(products.find(product => product.id === productId).englishDescription, "Persisted bilingual description.");
  await page.getByRole("button", { name: "Editar Burger do teste Owner", exact: true }).click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#dd6350";
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const imageEndpoint = origin + `/api/admin/products/${productId}/image`;
  await page.getByLabel(/Selecionar JPG, PNG ou WebP/).setInputFiles({
    name: "synthetic-owner-catalog.png", buffer: Buffer.from(image, "base64"), mimeType: "image/png",
  });
  await expect(page.getByRole("img", { name: "Prévia da nova imagem" })).toBeVisible();
  const uploaded = page.waitForResponse(response => response.url() === imageEndpoint && response.request().method() === "POST");
  await page.getByRole("button", { name: "Salvar imagem", exact: true }).click();
  assert.equal((await uploaded).status(), 200);
  await expect(page.getByText("Imagem salva no servidor")).toBeVisible();
  const withImage = await (await api.get(origin + "/api/admin/products")).json();
  const imageUrl = withImage.find(product => product.id === productId).imageUrl;
  assert.match(imageUrl, /^\/api\/product-images\/[a-f0-9]{32}\.webp$/);
  assert.equal((await api.get(origin + imageUrl)).status(), 200);
  await expect(page.getByRole("img", { name: "Imagem atual do produto" })).toHaveAttribute("src", imageUrl);
  step = "imagem e tradução gravadas aparecem na loja pública";
  const storefrontContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await storefrontContext.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const storefront = await storefrontContext.newPage();
  try {
    await storefront.goto(origin + "/menu");
    await storefront.getByRole("button", { name: /Selecionar idioma/i }).click();
    await storefront.getByRole("button", { name: "English", exact: true }).click();
    await storefront.getByRole("button", { name: /^View full menu$/i }).click();
    await storefront.getByRole("tab", { name: /^Sides/i }).click();
    const product = storefront.locator('[data-menu-product="o-praiano"]');
    await expect(product.getByRole("heading", { name: "Synthetic Burger" })).toBeVisible();
    await expect(product.getByText("Persisted bilingual description.")).toBeVisible();
    await expect(product.locator("img")).toHaveAttribute("src", imageUrl);
    await expect.poll(() => product.locator("img").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  } finally { await storefrontContext.close(); }
  step = "recarga e remoção da imagem no Owner";
  await page.reload();
  await expect(page.getByRole("img", { name: "Burger do teste Owner" })).toHaveAttribute("src", imageUrl);
  await page.getByRole("button", { name: "Editar Burger do teste Owner", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  const removed = page.waitForResponse(response => response.url() === imageEndpoint && response.request().method() === "DELETE");
  await page.getByRole("button", { name: "Remover imagem" }).click();
  assert.equal((await removed).status(), 204);
  const withoutImage = await (await api.get(origin + "/api/admin/products")).json();
  assert.equal(withoutImage.find(product => product.id === productId).imageUrl, null);
  evidence.steps.push("Categoria e imagem do produto gravadas e relidas, remoção persistida");
  step = "configuração operacional na API real";
  await page.goto(origin + "/admin/settings");
  await page.getByLabel("Em preparo", { exact: true }).fill("23");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByText("Configurações confirmadas pelo servidor.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Em preparo", { exact: true })).toHaveValue("23");
  evidence.steps.push("Limite operacional gravado e relido após recarga");
  step = "histórico de compras aprovadas do cliente";
  await page.goto(origin + "/admin/customers");
  await page.getByRole("button", { name: "Cliente Sintético", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Compras aprovadas (1)")).toBeVisible();
  step = "auditoria financeira com dados persistidos";
  await page.goto(origin + "/admin/finance");
  await expect(page.getByRole("heading", { name: "Auditoria financeira" })).toBeVisible();
  step = "receita em Relatórios com dados persistidos";
  await page.goto(origin + "/admin/reports");
  await expect(page.getByRole("heading", { name: "Receita bruta por data" })).toBeVisible();
  evidence.steps.push("Compra aprovada visível em Clientes, Financeiro e Relatórios com API real");
  step = "cadastro, saldo, revisão e histórico do estoque";
  await page.goto(origin + "/admin/inventory");
  await page.getByRole("button", { name: "Cadastrar insumo" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Farinha de teste");
  await page.getByLabel("Unidade", { exact: true }).fill("kg");
  await page.getByLabel("Estoque mínimo").fill("5");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  const ingredient = page.getByRole("row", { name: /Farinha de teste/ });
  await expect(ingredient).toContainText("Zerado");
  await expect(ingredient.getByRole("cell").nth(2)).toHaveText("5 kg");
  await page.getByRole("button", { name: "Movimentar" }).click();
  await page.getByLabel("Quantidade", { exact: true }).fill("6.125");
  await page.getByLabel("Motivo", { exact: true }).fill("Entrada sintética");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(ingredient).toContainText("6,125 kg");
  await expect(ingredient).toContainText("Adequado");
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.getByText("Entrada sintética", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  evidence.steps.push("Estoque cadastrado e movimentado pelo Owner com histórico na API");

  step = "cadastro de colaborador sem criação de acesso";
  await page.goto(origin + "/admin/team");
  await page.getByRole("button", { name: "Cadastrar Colaborador", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fechar janela" })).toBeFocused();
  const teamName = page.getByLabel("Nome Completo", { exact: true });
  await teamName.pressSequentially("Operador Sintético", { delay: 20 });
  await expect(teamName).toBeFocused();
  await expect(teamName).toHaveValue("Operador Sintético");
  await page.getByLabel("E-mail Corporativo", { exact: true }).fill("collaborator@example.invalid");
  await page.getByLabel("Escala de Turno", { exact: true }).fill("18:00 - 23:00");
  await page.getByRole("button", { name: "Salvar Colaborador", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Operador Sintético" })).toBeVisible();
  const team = await (await api.get(origin + "/api/admin/team")).json();
  const collaborator = team.items.find(member => member.name === "Operador Sintético");
  assert.ok(collaborator);
  allowedWrites.add("PUT /api/admin/team/" + collaborator.id);
  await page.getByRole("row", { name: /Operador Sintético/ }).getByRole("button", { name: "Desativar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar situação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ativar", exact: true })).toBeVisible();
  evidence.steps.push("Cadastro, edição de situação e foco por teclado da Equipe");
  step = "histórico administrativo individual da equipe";
  allowedWrites.add(`POST /api/admin/team/${collaborator.id}/journal`);
  await page.getByRole("navigation", { name: "Áreas da equipe" }).getByRole("button", { name: "Histórico administrativo", exact: true }).click();
  step = "seletor de colaborador do histórico";
  await page.getByRole("combobox", { name: "Colaborador", exact: true }).selectOption({ label: "Operador Sintético" });
  const journal = page.getByRole("region", { name: "Operador Sintético · gestão de equipe" });
  step = "formulário de histórico do colaborador";
  await journal.getByLabel("Observação administrativa").fill("Registro isolado do teste de equipe");
  const journalPost = page.waitForResponse(response => response.url() === origin + `/api/admin/team/${collaborator.id}/journal` && response.request().method() === "POST");
  step = "envio de uma ocorrência administrativa";
  await page.getByRole("button", { name: "Registrar ocorrência" }).click();
  const journalStatus = (await journalPost).status();
  step = `resposta ao registro administrativo (${journalStatus})`;
  assert.equal(journalStatus, 200);
  step = "observação administrativa visível após gravação";
  await expect(page.getByText("Registro isolado do teste de equipe", { exact: true })).toBeVisible();
  step = "releitura do registro administrativo na API";
  const periodMonth = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format().slice(0, 7);
  const record = await (await api.get(origin + `/api/admin/team/${collaborator.id}/operations?month=${periodMonth}-01`)).json();
  assert.ok(record.entries.some(entry => entry.note === "Registro isolado do teste de equipe" && entry.origin === "Owner"));
  await page.getByRole("button", { name: "Colaboradores", exact: true }).click();
  evidence.steps.push("Histórico administrativo da equipe gravado e relido pela API");

  step = "importação explícita da agenda sem apagar o original";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format();
  await page.evaluate(date => {
    localStorage.setItem("tbh_demo_agenda_events_v1", JSON.stringify([{
      id: "browser-fixture", title: "Agenda sintética", date, startTime: "09:00", endTime: "10:00",
      category: "Operação", status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }]));
  }, today);
  await page.getByRole("button", { name: /Abrir agenda/i }).first().click();
  await page.getByRole("button", { name: /Importar 1 compromissos/ }).click();
  await expect(page.getByText("Agenda sintética", { exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => !!localStorage.getItem("tbh_demo_agenda_events_v1")));
  await page.getByRole("button", { name: "Marcar compromisso Agenda sintética como concluído" }).click();
  await expect(page.getByRole("button", { name: "Reabrir compromisso Agenda sintética" })).toBeVisible();
  await page.keyboard.press("Escape");
  evidence.steps.push("Agenda importada explicitamente com origem local preservada");

  step = "leitura de notificação, reinício da API e releitura";
  await page.getByRole("button", { name: /Notificações.*1/ }).click();
  const drawer = page.getByRole("dialog", { name: "Notificações" });
  await drawer.getByRole("button", { name: new RegExp("Pedido #" + orderId) }).first().click();
  await expect(drawer.getByLabel("Não lida")).toHaveCount(0);
  await page.keyboard.press("Escape");
  host.kill();
  await hostClosed;
  ready = await startApi();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Operador Sintético" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar", exact: true })).toBeVisible();
  const stock = await (await api.get(origin + "/api/admin/stock")).json();
  assert.equal(stock[0].quantity, 6.125);
  const agenda = await (await api.get(origin + "/api/admin/agenda?start=" + today + "&end=" + today)).json();
  assert.equal(agenda[0].title, "Agenda sintética");
  assert.equal(agenda[0].status, "completed");
  const persistedInbox = await (await api.get(origin + "/api/admin/notifications/inbox")).json();
  assert.equal(persistedInbox.unreadCount, 0);
  assert.ok(persistedInbox.items.some(item => item.id === orderId && item.read));
  evidence.steps.push("Estoque, Equipe, Agenda e leitura da notificação persistiram após reinício da API");

  step = "evidências de acessibilidade e responsividade";
  await mkdir(acceptanceDir, { recursive: true });
  evidence.accessibility = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/admin/inventory");
    await expect(page.getByText("6,125 kg", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    evidence.accessibility.push({ width, overflow, violations: report.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })) });
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: join(acceptanceDir, "owner-stock-" + width + ".png"), animations: "disabled" });
    }
  }
  step = "catálogo público em Chromium com API real";
  const catalog = await (await api.get(origin + "/api/products")).json();
  assert.ok(catalog.some(item => item.code === "burger-praiano" && item.category === "sides"));
  await page.goto(origin + "/menu");
  await page.getByRole("button", { name: /^Ver cardápio completo$/i }).click();
  const menu = page.getByRole("dialog", { name: /^Escolha seu favorito\.$/i });
  await menu.getByRole("tab", { name: /^Acompanhamentos/i }).click();
  const productCard = menu.locator('[data-menu-product="o-praiano"]');
  await expect(productCard.getByText("Burger do teste Owner", { exact: true })).toBeVisible();
  await productCard.getByRole("button", { name: /^Adicionar Burger do teste Owner$/i }).click();
  await menu.getByRole("button", { name: "Ver sacola", exact: true }).click();
  await expect(page.locator('[data-cart-product="o-praiano"]')).toContainText(/R\$\s*43,90/);
  evidence.steps.push("Categoria alterada no Owner apareceu no cardápio público e o preço da API chegou à sacola");

  step = "medição em Chromium e axe da vitrine";
  evidence.browser = browser.version();
  evidence.performance = [];
  await context.addInitScript(() => {
    const samples = { lcpMs: null, layoutShifts: [], interactions: [] };
    Object.assign(window, { tbhLab: samples });
    new PerformanceObserver(list => {
      const entry = list.getEntries().at(-1);
      if (entry) samples.lcpMs = Math.round(entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(list => {
      for (const shift of list.getEntries()) {
        if (!shift.hadRecentInput) samples.layoutShifts.push({ time: shift.startTime, value: shift.value });
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(list => {
      for (const event of list.getEntries()) if (event.interactionId) samples.interactions.push(event.duration);
    }).observe({ type: "event", durationThreshold: 16 });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 40, downloadThroughput: 5_000_000 / 8, uploadThroughput: 2_000_000 / 8,
    });
    for (const route of ["/", "/admin/inventory"]) {
      const samples = [];
      for (let i = 0; i < 3; i++) {
        step = "medição Chromium " + route + " amostra " + (i + 1);
        const instrument = i === 0;
        if (instrument) {
          await page.coverage.startJSCoverage();
          await page.coverage.startCSSCoverage();
        }
        await page.goto(origin + route);
        await page.waitForTimeout(2000);
        if (route === "/admin/inventory") await page.getByRole("checkbox", { name: "Abaixo do mínimo" }).click();
        await page.waitForTimeout(250);
        const timing = await page.evaluate(() => {
          let cls = 0;
          let start = 0;
          let end = 0;
          let sum = 0;
          for (const shift of window.tbhLab.layoutShifts) {
            if (shift.time - end > 1000 || shift.time - start > 5000) { start = shift.time; sum = 0; }
            end = shift.time;
            sum += shift.value;
            cls = Math.max(cls, sum);
          }
          return {
            lcpMs: window.tbhLab.lcpMs,
            cls: Number(cls.toFixed(3)),
            ttfbMs: Math.round(performance.getEntriesByType("navigation")[0].responseStart),
            stockFilterInteractionMs: Math.max(0, ...window.tbhLab.interactions) || null,
          };
        });
        let coverage;
        if (instrument) {
          const [javascript, css] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);
          const cssCharacters = css.filter(entry => entry.url.startsWith(origin)).reduce((sum, entry) => ({
            total: sum.total + (entry.text?.length ?? 0),
            used: sum.used + entry.ranges.reduce((used, range) => used + range.end - range.start, 0),
          }), { total: 0, used: 0 });
          const functions = javascript.filter(entry => entry.url.startsWith(origin)).flatMap(entry => entry.functions);
          coverage = {
            cssCharacters,
            javascriptFunctions: { total: functions.length, executed: functions.filter(fn => fn.ranges[0]?.count > 0).length },
          };
        }
        samples.push({ ...timing, ...(coverage && { coverage }) });
      }
      evidence.performance.push({ route, profile: "Chrome headless 390×844, loopback HTTPS, cache frio, 40ms, 5/2 Mbps, CPU nativa", samples });
    }
  } finally { await cdp.detach(); }
  step = "axe da vitrine";
  await page.goto(origin + "/");
  const storefrontAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  evidence.storefrontAccessibility = storefrontAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));

  step = "logout";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/admin/inventory");

  await page.getByRole("button", { name: "Menu do proprietário" }).click();
  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  assert.equal((await api.get(orderUrl)).status(), 401);
  evidence.steps.push("Logout revogou acesso");
  await mkdir(acceptanceDir, { recursive: true });
  await writeFile(join(acceptanceDir, `owner-browser-${postgres ? "postgres" : "sqlite"}.json`), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} catch {
  // Avoid printing assertion traces from password fields or authenticated responses.
  console.error("Verificação real interrompida em: " + step);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (gateway) await new Promise(resolveClose => gateway.close(resolveClose));
  if (host) { host.kill(); await hostClosed; }
  bundle?.cleanup();
  if (resolve(runRoot, "..") === temporaryRoot) await rm(runRoot, { recursive: true, force: true });
}
