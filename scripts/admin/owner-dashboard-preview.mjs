import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../..");
const apiDir = join(root, "backend/BurgerHouse.Api");
const fixtures = join(root, "backend/tools/HomologationFixture");
const ownerDir = join(root, "owner-ui");
const output = process.argv[2] === "--capture" && process.argv[3] ? resolve(process.argv[3]) : null;
if (process.argv.length > 2 && !output) throw new Error("Use --capture <diretório> ou execute sem argumentos.");
const password = output ? "Fixture-" + randomBytes(24).toString("hex") : process.env.OWNER_DASHBOARD_PREVIEW_PASSWORD;
if (!password || password.length < 16) throw new Error("Defina OWNER_DASHBOARD_PREVIEW_PASSWORD para a conta local descartável.");
const project = await readFile(join(apiDir, "BurgerHouse.Api.csproj"), "utf8");
const secretsId = /<UserSecretsId>([a-z0-9-]+)<\/UserSecretsId>/i.exec(project)?.[1];
assert.ok(secretsId && process.env.APPDATA, "User Secrets do perfil Windows indisponíveis.");
const secrets = JSON.parse(await readFile(join(process.env.APPDATA, "Microsoft/UserSecrets", secretsId, "secrets.json"), "utf8"));
const privacy = secrets["Privacy:EncryptionKey"] ?? secrets.Privacy?.EncryptionKey;
assert.ok(typeof privacy === "string" && privacy.length > 0, "A chave de privacidade existente é necessária.");

async function bindPort(port) {
  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  const bound = probe.address().port;
  await new Promise((done, fail) => probe.close(error => error ? fail(error) : done()));
  return bound;
}

async function selectPort(configured, fallback) {
  const port = configured === undefined ? fallback : Number(configured);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Porta local inválida.");
  try { return await bindPort(port); }
  catch (error) {
    if (!output || configured !== undefined || error.code !== "EADDRINUSE") throw error;
    const available = await bindPort(0);
    console.log(`Porta ${port} ocupada. A validação vai usar ${available} em loopback.`);
    return available;
  }
}

async function ready(url, child, status) {
  for (let attempt = 0; attempt < 80 && child.exitCode === null; attempt++) {
    const result = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(800) }).catch(() => null);
    if (result?.status === status) return;
    await delay(250);
  }
  throw new Error("O processo local não respondeu em " + new URL(url).origin);
}

const apiPort = await selectPort(process.env.OWNER_DASHBOARD_API_PORT, 5449);
const ownerPort = await selectPort(process.env.OWNER_DASHBOARD_VITE_PORT, 5173);
const api = `http://127.0.0.1:${apiPort}`;
const owner = `http://127.0.0.1:${ownerPort}`;
const scratch = await mkdtemp(join(tmpdir(), "burgerhouse-homologation-owner-test-"));
const build = await mkdtemp(join(tmpdir(), "tbh-owner-dashboard-build-"));
const children = [];
function start(command, args, options) {
  const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "ignore", "ignore"], ...options });
  children.push(child);
  return child;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => children.forEach(child => child.kill()));
let browser;
try {
  for (const [dir, file, target] of [[apiDir, "BurgerHouse.Api.csproj", "api"], [fixtures, "HomologationFixture.csproj", "fixture"]]) {
    execFileSync("dotnet", ["build", file, "--no-restore", "--output", join(build, target)], { cwd: dir, stdio: "inherit" });
  }
  const environment = {
    ...process.env, Privacy__EncryptionKey: privacy,
    HOMOLOGATION_OWNER_PASSWORD: password,
    ASPNETCORE_ENVIRONMENT: "Development", DOTNET_ENVIRONMENT: "Development",
    ASPNETCORE_URLS: api, ASPNETCORE_HTTP_PORTS: "", ASPNETCORE_HTTPS_PORTS: "", ASPNETCORE_HTTPS_PORT: "",
    OwnerDashboardPreview__Root: scratch,
    ConnectionStrings__DefaultConnection: `Data Source=${join(scratch, "burgerhouse.homologation.db")};Mode=ReadWrite;Pooling=False`,
    Admin__DataProtectionPath: "",
    AZURE_TRANSLATION_ENABLED: "false", PagBank__Token: "disabled-owner-dashboard-preview",
  };
  execFileSync("dotnet", [join(build, "fixture/HomologationFixture.dll"), "--owner-dashboard", scratch],
    { env: environment, stdio: ["ignore", "inherit", "inherit"] });
  const apiProcess = start("dotnet", [join(build, "api/BurgerHouse.Api.dll"), "--urls", api],
    { cwd: apiDir, env: environment });
  await ready(api + "/api/admin/finance/revenue-by-category", apiProcess, 401);
  assert.equal((await fetch(api + "/api/checkout/1", { method: "POST" })).status, 403);
  const vite = start(process.execPath, [join(ownerDir, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(ownerPort), "--strictPort"],
    { cwd: ownerDir, env: { ...process.env, BURGER_DEV_API_ORIGIN: api } });
  await ready(owner + "/admin/", vite, 200);
  console.log("Owner local em " + owner + "/admin/?showcase=0 · API isolada em " + api);
  if (!output) {
    console.log("Conta descartável: owner.homologation@example.invalid. Use a senha definida no ambiente.");
    await Promise.race([once(apiProcess, "close"), once(vite, "close")]);
  } else {
    const { chromium, expect: baseExpect } = await import("@playwright/test");
    const expect = baseExpect.configure({ timeout: 30000 });
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    browser = await chromium.launch({ channel: "chrome", args: [
      "--disable-background-networking", "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light",
      reducedMotion: "reduce", serviceWorkers: "block", hasTouch: true });
    await context.route("**/*", route => new URL(route.request().url()).origin === owner ? route.continue() : route.abort());
    const page = await context.newPage();
    assert.equal((await context.request.get(owner + "/api/admin/orders/movement")).status(), 401);
    await page.goto(owner + "/admin/?showcase=0");
    await page.getByLabel("E-mail", { exact: true }).fill("owner.homologation@example.invalid");
    await page.getByLabel("Senha", { exact: true }).fill(password);
    const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/auth/login" &&
      response.request().method() === "POST", { timeout: 30000 });
    await page.getByRole("button", { name: /^Entrar/ }).click();
    assert.equal((await loginResponse).status(), 200);
    await page.getByRole("heading", { name: "Visão Geral", exact: true }).waitFor({ state: "visible", timeout: 30000 });
    const categories = page.getByRole("region", { name: "Faturamento por categoria" });
    const movement = page.getByRole("region", { name: "Movimento da hamburgueria" });
    await expect(categories.locator("svg[role=application]")).toBeVisible({ timeout: 15000 });
    assert.ok((await context.cookies()).some(cookie => cookie.name === "BurgerHouse.Owner" && cookie.httpOnly && cookie.sameSite === "Strict"));
    const [finance, traffic] = await Promise.all([
      context.request.get(owner + "/api/admin/finance/revenue-by-category?period=7d"),
      context.request.get(owner + "/api/admin/orders/movement"),
    ]);
    assert.equal(finance.status(), 200);
    assert.equal(traffic.status(), 200);
    const financeData = await finance.json();
    const trafficData = await traffic.json();
    const amounts = financeData.categories.reduce((sum, row) => sum + Math.round(row.revenue * 100), 0);
    assert.equal(amounts + Math.round(financeData.deliveryFees * 100), Math.round(financeData.grossRevenue * 100));
    const count = trafficData.hours.reduce((sum, row) => sum + row.count, 0);
    await mkdir(output, { recursive: true });
    const checks = [];
    const capture = async (theme, device, mode) => {
      if (mode === "mensal" || mode === "dia-horario") {
        const selected = movement.locator('button[data-level="4"]').first();
        if (device === "tablet" && mode === "mensal") await selected.tap();
        else await selected.evaluate(button => button.focus({ preventScroll: true }));
        await expect(movement.getByRole("status")).toContainText("do total");
      }
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      const report = await new AxeBuilder({ page }).include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      assert.equal(report.violations.length, 0, JSON.stringify(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
      const screenshot = `${theme}-${device}-${mode}.png`;
      await page.screenshot({ path: join(output, screenshot), fullPage: true, animations: "disabled" });
      checks.push({ screenshot, overflow, violations: report.violations.length });
    };
    for (const theme of ["claro", "escuro"]) {
      if (theme === "escuro") await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 1024, 768]]) {
        await page.setViewportSize({ width, height });
        await page.goto(owner + "/admin/dashboard");
        await expect(categories.locator("svg[role=application]")).toBeVisible();
        await expect(page.getByRole("group", { name: "Período de vendas" }).getByRole("radio", { name: "7 dias", exact: true })).toBeChecked();
        await expect(page.getByRole("region", { name: "Indicadores do dia" }).getByRole("article")).toHaveCount(5);
        if (process.env.OWNER_DASHBOARD_MANY_ORDERS === "1") {
          const table = page.getByRole("table", { name: "Pedidos ativos mais recentes do dia" });
          await expect.poll(() => table.getByRole("rowheader").count()).toBeGreaterThanOrEqual(20);
          assert.equal(await page.getByRole("region", { name: "Lista de pedidos ativos de hoje" })
            .evaluate(node => node.scrollHeight > node.clientHeight), true);
        }
        await expect(page.getByRole("region", { name: "Pipeline operacional" }).getByRole("button")).toHaveCount(5);
        await expect(movement).toHaveCount(0);
        await expect(page.getByRole("region", { name: "Alertas" })).toContainText("Tudo em ordem");
        await expect(page.locator(".owner-kpi-attention")).toContainText("Limite de atraso desativado");
        await expect(page.getByText("Vendas em um único dia. Os demais dias do período não tiveram vendas.")).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Atalhos do painel" })).toHaveCount(0);
        const geometry = await page.evaluate(() => {
          const boxes = selector => [...document.querySelectorAll(selector)].map(node => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, span: getComputedStyle(node).gridColumnStart };
          });
          return { kpis: boxes(".owner-overview-kpis > article"),
            actions: boxes(".owner-overview-action-row > section"), trends: boxes(".owner-overview-trend-row > section") };
        });
        assert.ok(geometry.kpis.every(rect => Math.abs(rect.y - geometry.kpis[0].y) < 1 &&
          Math.abs(rect.height - geometry.kpis[0].height) < 1));
        for (const pair of device === "desktop" ? [geometry.actions, geometry.trends] : [geometry.actions]) {
          assert.equal(pair[0].span, "span 8");
          assert.equal(pair[1].span, "span 4");
          assert.ok(Math.abs(pair[0].y - pair[1].y) < 1);
        }
        assert.ok(Math.abs(geometry.actions[0].height - geometry.actions[1].height) < 1);
        if (device === "desktop") assert.ok(Math.abs(geometry.trends[0].height - geometry.trends[1].height) < 1);
        else assert.ok(geometry.trends[1].y > geometry.trends[0].y);
        await capture(theme, device, "visao-geral");
        if (process.env.OWNER_DASHBOARD_OVERVIEW_ONLY === "1") continue;
        await categories.getByRole("button", { name: "Ver conciliação no Financeiro" }).click();
        await expect(page.getByRole("heading", { name: "Meios de pagamento", exact: true })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Período", exact: true })).toHaveValue("7d");
        const reconciliation = page.getByRole("region", { name: "Conciliação de produtos e pagamentos" });
        await reconciliation.getByText("Ver conciliação", { exact: true }).click();
        await expect(reconciliation).toContainText("Frete identificado");
        await capture(theme, device, "financeiro");
        await page.goto(owner + "/admin/reports");
        await expect(page.getByRole("heading", { name: "Histórico de faturamento por categoria" })).toBeVisible();
        await expect(movement.getByRole("status")).toHaveText(`${count} pedidos no período`);
        await movement.getByText("Dia e horário", { exact: true }).click();
        await expect(movement.getByRole("group", { name: "Mapa por dia e horário" })).toBeVisible();
        await capture(theme, device, "dia-horario");
        await movement.getByText("Mensal", { exact: true }).click();
        await expect(movement.getByRole("group", { name: "Calendário de movimento" })).toBeVisible();
        await capture(theme, device, "mensal");
      }
    }
    const session = await (await context.request.get(owner + "/api/admin/auth/me")).json();
    const settings = await (await context.request.get(owner + "/api/admin/operation/settings")).json();
    const settingsResponse = await context.request.put(owner + "/api/admin/operation/settings", {
      headers: { "X-CSRF-TOKEN": session.csrfToken },
      data: { ...settings, limits: { ...settings.limits, preparing: 180, pendingPaymentAgeHours: 2 } },
    });
    assert.equal(settingsResponse.status(), 204);
    for (const theme of ["escuro", "claro"]) {
      if (theme === "claro") await page.getByRole("button", { name: "Alternar para tema claro" }).click();
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 1024, 768]]) {
        await page.setViewportSize({ width, height });
        await page.goto(owner + "/admin/dashboard");
        const card = page.locator(".owner-kpi-attention");
        const alerts = page.getByRole("region", { name: "Alertas" });
        await expect(card).toHaveAttribute("data-alert", "true");
        await expect(card).toContainText("Limite por etapa: 180 min");
        await expect(alerts.getByRole("button", { name: /Pedidos atrasados na cozinha/ })).toBeVisible();
        await expect(alerts.getByRole("button", { name: /Pagamento pendente há 2 h/ })).toBeVisible();
        await expect(categories.locator("svg[role=application]")).toBeVisible();
        await capture(theme, device, "alertas");
      }
    }
    // Read failure is injected only into the disposable browser session, never the real API.
    await page.route(url => url.pathname === "/api/admin/operation/settings", route =>
      route.fulfill({ status: 503, json: { error: "Limites indisponíveis no teste isolado." } }));
    for (const theme of ["claro", "escuro"]) {
      if (theme === "escuro") await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 1024, 768]]) {
        await page.setViewportSize({ width, height });
        await page.goto(owner + "/admin/dashboard");
        await expect(page.locator(".owner-kpi-attention")).toHaveAttribute("data-state", "attention");
        await expect(page.locator(".owner-kpi-attention")).toHaveAttribute("data-surface", "amber");
        await expect(page.locator(".owner-kpi-attention")).toContainText("Limite indisponível");
        await expect(categories.locator("svg[role=application]")).toBeVisible();
        await capture(theme, device, "atencao");
      }
    }
    const greetings = [];
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());
    for (const theme of ["escuro", "claro"]) {
      if (theme === "claro") await page.getByRole("button", { name: "Alternar para tema claro" }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      for (const [time, text, period] of [["09:00", "Bom dia!", "manha"], ["15:00", "Boa tarde!", "tarde"], ["21:00", "Boa noite!", "noite"]]) {
        await page.clock.setFixedTime(new Date(`${day}T${time}:00-03:00`));
        await page.goto(owner + "/admin/dashboard");
        await expect(page.locator(".owner-overview-greeting")).toHaveText(text);
        const screenshot = `${theme}-saudacao-${period}.png`;
        await page.locator(".owner-overview > header").screenshot({ path: join(output, screenshot), animations: "disabled" });
        greetings.push({ screenshot, text, localTime: time, simulatedClock: true });
      }
    }
    await writeFile(join(output, "validacao.json"), JSON.stringify({ chromium: browser.version(), api, owner, financeData, count, checks, greetings }, null, 2) + "\n");
    console.log(`Grade 12 colunas, dados conciliados e ${checks.length} capturas verificadas no Chromium.`);
  }
} finally {
  if (browser) await browser.close();
  await Promise.all(children.map(child => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    const closed = once(child, "close");
    child.kill();
    return closed;
  }));
  if (dirname(scratch) === resolve(tmpdir())) await rm(scratch, { recursive: true, force: true, maxRetries: 4 });
  if (dirname(build) === resolve(tmpdir())) await rm(build, { recursive: true, force: true, maxRetries: 4 });
}
