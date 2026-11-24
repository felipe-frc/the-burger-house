import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = resolve(import.meta.dirname, "..");
const owner = join(root, "owner-ui");
const output = resolve(process.argv[2] ?? join(root, "test-results", "acceptance", "owner-plan"));
await mkdir(output, { recursive: true });

const reserved = createServer();
reserved.listen(0, "127.0.0.1");
await once(reserved, "listening");
const { port } = reserved.address();
await new Promise((done, fail) => reserved.close(error => error ? fail(error) : done()));
const base = `http://127.0.0.1:${port}`;
const host = spawn(process.execPath, [join(owner, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: owner, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DISABLE_HMR: "true", BURGER_DEV_API_ORIGIN: "http://127.0.0.1:9" } });
const hostClosed = once(host, "close");
host.stderr.resume();
const deadline = setTimeout(() => host.stdout.destroy(new Error("O servidor local não iniciou em 20 segundos.")), 20_000);
let browser;

const routes = [
  ["dashboard", "Visão Geral"], ["orders", "Pedidos"], ["kitchen", "Cozinha"], ["dispatch", "Expedição"],
  ["deliveries", "Entregas"], ["products", "Gestão de Cardápio & Itens"], ["inventory", "Estoque"], ["customers", "Clientes"],
  ["finance", "Financeiro"], ["reports", "Relatórios"], ["team", "Equipe"], ["settings", "Configurações"],
];
const evidence = { browser: "", isolated: true, screenshots: [], accessibility: [], responsive: [], peak: {} };

try {
  let startup = "";
  for await (const chunk of host.stdout.iterator({ destroyOnReturn: false })) {
    startup += chunk.toString();
    if (startup.includes(base)) break;
  }
  clearTimeout(deadline);
  host.stdout.resume();
  browser = await chromium.launch({ channel: "chrome", args: [
    "--disable-background-networking", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ] });
  evidence.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR",
    timezoneId: "America/Sao_Paulo", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const unexpectedApiCalls = [];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) { unexpectedApiCalls.push(url.pathname); return route.abort(); }
    return url.origin === base ? route.continue() : route.abort("blockedbyclient");
  });
  const shot = async name => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(output, name + ".png"), animations: "disabled" });
    evidence.screenshots.push(name);
  };
  async function go(route, heading) {
    await page.goto(base + "/admin/" + route + "?showcase=1");
    await expect(page.getByText("Demonstração · cenário de 17/11/2026", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    await expect(page.locator("main [role=status]", { hasText: /^Carregando|^Consultando/ })).toHaveCount(0);
  }
  async function measure(route, width, theme) {
    const dimensions = await page.evaluate(() => {
      const toolbarGroups = [...document.querySelectorAll(".owner-navbar > *")]
        .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0);
      return {
        viewport: document.documentElement.clientWidth, width: document.documentElement.scrollWidth,
        toolbarOverlap: toolbarGroups.slice(1).some((rect, index) => rect.left + 1 < toolbarGroups[index].right),
        overflowingTables: [...document.querySelectorAll(".owner-table-shell")].filter(table => table.scrollWidth > table.clientWidth + 1).length,
        smallVisibleText: [...document.querySelectorAll("main *")].filter(node => node.childElementCount === 0 && node.textContent.trim() &&
          node.getBoundingClientRect().width && node.getBoundingClientRect().height && parseFloat(getComputedStyle(node).fontSize) < 12 &&
          !node.classList.contains("sr-only")).length,
      };
    });
    evidence.responsive.push({ route, width, theme, ...dimensions });
    assert.ok(dimensions.width <= dimensions.viewport + 1, `Rolagem horizontal em ${route} (${width})`);
    assert.equal(dimensions.toolbarOverlap, false, `Grupos da barra superior sobrepostos em ${route} (${width})`);
    if (width >= 1280) assert.equal(dimensions.overflowingTables, 0, `Tabela cortada em ${route}`);
  }
  async function axe(route, theme) {
    await page.evaluate(() => document.fonts.ready);
    const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    evidence.accessibility.push({ route, theme, violations: report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.target) })) });
  }
  const sidebar = page.getByRole("complementary", { name: "Navegação administrativa" });
  const openSidebar = page.getByRole("button", { name: "Abrir menu lateral" });
  async function chooseModule(name) {
    if (await openSidebar.isVisible()) await openSidebar.click();
    await sidebar.getByRole("button", { name, exact: true }).click();
  }

  for (const theme of ["claro", "escuro"]) {
    if (theme === "escuro") await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
    await go("dashboard", "Visão Geral");
    await expect(sidebar).toHaveCSS("width", "76px");
    await sidebar.getByRole("button", { name: "Expandir barra lateral" }).click();
    await expect(sidebar).toHaveCSS("width", "250px");
    await expect(sidebar.getByRole("navigation").getByRole("button")).toHaveCount(12);
    await expect(sidebar.getByRole("button", { name: "Pedidos", exact: true }).locator(".owner-sidebar-badge")).toHaveText("49");
    await shot(`${theme}-sidebar-expandida`);
    await sidebar.getByRole("button", { name: "Recolher barra lateral" }).click();
    await expect(sidebar).toHaveCSS("width", "76px");
    assert.equal(await sidebar.getByRole("navigation").evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    await measure("sidebar-recolhida", 1440, theme);
    await axe("sidebar-recolhida", theme);
    await shot(`${theme}-sidebar-recolhida`);
    await sidebar.getByRole("button", { name: "Pedidos", exact: true }).focus();
    await expect(page.locator("[data-sidebar-tooltip] .owner-sidebar-badge")).toHaveText("49");
    await shot(`${theme}-sidebar-tooltip`);
    await page.keyboard.press("Escape");
    for (const [route, heading] of routes) {
      await go(route, heading);
      if (route === "dashboard") {
        const fontNames = await page.evaluate(async () => {
          const styles = ['20px Anton', '600 16px "Barlow Condensed"', '14px "Plus Jakarta Sans"'];
          return (await Promise.all(styles.map(style => document.fonts.load(style)))).flat().map(face => face.family.replaceAll('"', ''));
        });
        assert.deepEqual(fontNames, ["Anton", "Barlow Condensed", "Plus Jakarta Sans"]);
        evidence.fonts = fontNames;
      }
      await measure(route, 1440, theme);
      await axe(route, theme);
      await shot(theme + "-" + route);
    }
    await page.getByRole("button", { name: "Abrir agenda" }).click();
    await expect(page.getByRole("dialog").getByText("Conferir estoque de fechamento", { exact: true })).toBeVisible();
    await axe("agenda", theme);
    await shot(theme + "-agenda");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Menu do proprietário" }).click();
    await page.getByRole("menuitem", { name: "Histórico de auditoria" }).click();
    await expect(page.getByRole("dialog").getByText("Movimentação registrada", { exact: true })).toBeVisible();
    await axe("auditoria", theme);
    await shot(theme + "-audit");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Notificações/ }).click();
    await expect(page.getByRole("dialog").getByText("1 nova")).toHaveCount(0);
    await expect(page.getByRole("dialog").getByText("5 novas", { exact: true })).toBeVisible();
    await axe("notificacoes", theme);
    await shot(theme + "-notificacoes");
    await page.keyboard.press("Escape");
    await go("orders", "Pedidos");
    await page.getByRole("button", { name: /^Ver detalhes do pedido/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await axe("detalhe", theme);
    await shot(theme + "-detalhe");
    await page.keyboard.press("Escape");
  }
  await go("orders", "Pedidos");
  await expect(page.getByRole("radio", { name: "Todos", exact: true })).toBeChecked();
  await expect(page.locator("svg filter feDisplacementMap")).toHaveCount(0);
  const visualEmulation = await context.newCDPSession(page);
  for (const type of ["deuteranopia", "protanopia"]) {
    await visualEmulation.send("Emulation.setEmulatedVisionDeficiency", { type });
    await expect(page.locator("td .owner-status").filter({ hasText: "Aguardando pagamento" }).first()).toBeVisible();
    await expect(page.locator("td .owner-status").filter({ hasText: "Em preparo" }).first()).toBeVisible();
    await shot("escuro-" + type);
  }
  await visualEmulation.send("Emulation.setEmulatedVisionDeficiency", { type: "none" });
  await visualEmulation.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await expect(page.locator(".owner-navbar")).toHaveCSS("backdrop-filter", "none");
  await expect(page.locator(".owner-panel").first()).toHaveCSS("background-image", "none");
  await visualEmulation.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "no-preference" }] });
  await visualEmulation.detach();
  evidence.visionSimulation = ["deuteranopia", "protanopia"];
  evidence.reducedTransparency = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await go("dashboard", "Visão Geral");
  await measure("dashboard", 390, "escuro");
  await shot("mobile-escuro-dashboard");
  await page.getByRole("button", { name: "Alternar para tema claro" }).click();
  await measure("dashboard", 390, "claro");
  await shot("mobile-claro-dashboard");
  await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [route, heading] of routes.filter(([name]) => ["dashboard", "orders", "finance", "inventory", "customers"].includes(name))) {
    await go(route, heading);
    await measure(route, 1280, "escuro");
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const theme of ["escuro", "claro"]) {
    if (theme === "claro") await page.getByRole("button", { name: "Alternar para tema claro" }).click();
    for (const [route, heading] of routes.filter(([name]) => ["dashboard", "inventory", "reports", "team"].includes(name))) {
      await go(route, heading);
      await measure(route, 1024, theme);
      await axe(`${route}-tablet`, theme);
      await shot(`${theme}-tablet-${route}`);
    }
    await go("kitchen", "Cozinha");
    await expect(sidebar).toBeHidden();
    const mainWidth = await page.locator("main").evaluate(node => node.clientWidth);
    assert.ok(mainWidth >= 900, "A gaveta fechada deve liberar espaço para as filas");
    await openSidebar.focus();
    await page.keyboard.press("Enter");
    await expect(sidebar.getByRole("button", { name: "Fechar menu lateral" })).toBeFocused();
    await expect(sidebar.getByRole("button", { name: "Cozinha", exact: true })).toHaveAttribute("aria-current", "page");
    await measure("sidebar-tablet", 1024, theme);
    await shot(`${theme}-sidebar-tablet`);
    await page.keyboard.press("Escape");
    await expect(openSidebar).toBeFocused();
  }
  await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await go("orders", "Pedidos");
  await expect(page.getByRole("button", { name: "Ativos (49)", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Paginação de pedidos" })).toContainText("20 de 49");
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Paginação de pedidos" })).toContainText("Página 2 · 20 de 49");
  await measure("orders", 1024, "escuro");
  await shot("tablet-pedidos");
  await chooseModule("Cozinha");
  const kitchen = page.getByRole("button", { name: "Iniciar Preparo na Chapa" });
  await expect(kitchen).toHaveCount(14);
  evidence.peak = { activeOrders: 49, kitchenOrders: await page.getByRole("article", { name: /^Pedido #/ }).count(), cpuThrottle: 4 };
  await measure("kitchen", 1024, "escuro");
  await shot("tablet-cozinha");
  const targets = await kitchen.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height).filter(Boolean));
  assert.ok(targets.every(height => height >= 44));
  evidence.peak.minimumVisibleActionHeight = Math.min(...targets);
  const deliveryStart = page.getByRole("article", { name: /^Pedido #/ }).filter({ hasText: /Entrega ·/ })
    .getByRole("button", { name: "Iniciar Preparo na Chapa" }).first();
  const oldestExpected = deliveryStart.locator("xpath=ancestor::article").getByRole("heading");
  const code = (await oldestExpected.innerText()).trim();
  const card = () => page.getByRole("article", { name: "Pedido " + code, exact: true });
  await deliveryStart.click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Desfazer", exact: true })).toHaveCount(0);
  await expect(card().getByRole("button", { name: "Iniciar Preparo na Chapa" })).toBeEnabled();
  const startButton = card().getByRole("button", { name: "Iniciar Preparo na Chapa" });
  await startButton.scrollIntoViewIfNeeded();
  await startButton.evaluate((button, orderCode) => {
    button.addEventListener("click", () => {
      const started = performance.now();
      const marks = {};
      window.ownerPeakTiming = marks;
      const observer = new MutationObserver(() => {
        if (marks.feedbackMs === undefined && [...document.querySelectorAll('[role="status"]')]
          .some(node => node.textContent.includes("Atualização agendada para o pedido " + orderCode))) {
          marks.feedbackMs = Math.round(performance.now() - started);
        }
        const stageCard = document.querySelector(`article[aria-label="Pedido ${orderCode}"]`);
        if (stageCard && [...stageCard.querySelectorAll("button")].some(node => !node.disabled &&
          node.textContent.includes("Marcar como Pronto (Expedição)"))) {
          marks.preparingMs = Math.round(performance.now() - started);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    }, { once: true });
  }, code);
  await startButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
  await expect(card().getByRole("button", { name: "Marcar como Pronto (Expedição)" })).toBeEnabled({ timeout: 18000 });
  const measured = await page.evaluate(() => window.ownerPeakTiming);
  assert.ok(Number.isFinite(measured.feedbackMs) && Number.isFinite(measured.preparingMs));
  evidence.peak.actionFeedbackMs = measured.feedbackMs;
  evidence.peak.activationToPreparingMs = measured.preparingMs;
  const finishButton = card().getByRole("button", { name: "Marcar como Pronto (Expedição)" });
  await finishButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
  await expect(card()).toHaveCount(0, { timeout: 12000 });
  await chooseModule("Expedição");
  const dispatch = page.getByRole("article", { name: "Conferência do pedido " + code });
  await expect(dispatch).toBeVisible();
  const release = dispatch.getByRole("button", { name: /^Liberar/ });
  await expect(release).toBeDisabled();
  const unchecked = dispatch.locator('button[aria-pressed="false"]');
  while (await unchecked.count()) await unchecked.first().click();
  await dispatch.getByLabel("Embalagem conferida").check();
  await expect(release).toBeDisabled();
  await dispatch.getByLabel("Identificação conferida").check();
  await release.click();
  await expect(dispatch).toHaveCount(0);
  await chooseModule("Entregas");
  const delivery = page.getByRole("article").filter({ has: page.getByRole("heading", { name: code, exact: true }) });
  const confirmDelivery = delivery.getByRole("button", { name: "Confirmar Entrega Realizada" });
  await expect(confirmDelivery).toBeVisible();
  await confirmDelivery.click();
  await expect(confirmDelivery).toHaveCount(0, { timeout: 8000 });
  evidence.peak.order = code;
  await chooseModule("Pedidos");
  await page.getByRole("searchbox", { name: "Buscar pedidos" }).fill("sem resultados desta busca");
  await expect(page.getByText("Nenhum pedido corresponde a estes filtros.")).toBeVisible();
  await shot("tablet-pedidos-vazio");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Busca global" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Busca global" })).toBeHidden();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  assert.deepEqual(unexpectedApiCalls, [], "A demonstração fez tráfego de API");
  assert.deepEqual(pageErrors, [], "Erros JavaScript durante o cenário");
  evidence.unexpectedApiCalls = unexpectedApiCalls.length;
  evidence.pageErrors = pageErrors.length;
  assert.deepEqual(evidence.accessibility.filter(row => row.violations.length), [], "Violações WCAG nos módulos ou diálogos");
  console.log(JSON.stringify({ output, screenshots: evidence.screenshots.length, views: evidence.responsive.length,
    peak: evidence.peak, axeViolations: evidence.accessibility.flatMap(row => row.violations).length }));
} finally {
  clearTimeout(deadline);
  await writeFile(join(output, "validacao.json"), JSON.stringify(evidence, null, 2) + "\n");
  if (browser) await browser.close();
  host.kill();
  await hostClosed;
}
