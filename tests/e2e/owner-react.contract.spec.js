import { test, expect } from "./owner-react-fixture.js";
import { mockData, order } from "../admin-fixtures.js";
import { fixture, signIn } from './owner-contract-fixture.js';
import AxeBuilder from "@axe-core/playwright";

for (const width of [320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1920]) {
  test(`Owner preserves overview and theme controls without overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 768 ? 640 : 900 });
    await fixture(page);
    await page.goto('/admin/');
    await signIn(page);
    await expect(page.locator('.owner-overview-kpis > article')).toHaveCount(5);
    for (const theme of ['escuro', 'claro']) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const toggle = page.getByRole('button', { name: `Alternar para tema ${theme}` });
      await toggle.focus();
      await page.keyboard.press('Enter');
      if (theme === 'escuro') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
      else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    }
    if ([320, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(`owner-layout-${width}.png`) });
  });
}



for (const module of ['Financeiro', 'Relatórios']) {
  test(`pagamento conciliado atualiza ${module} sem remontar a página`, async ({ page }) => {
    await page.clock.install();
    await fixture(page);
    let settled = false;
    let summaryReads = 0;
    await page.route(url => url.pathname === '/api/admin/finance/summary', route => {
      summaryReads++;
      return route.fulfill({ json: { ...mockData('finance/summary'),
        grossRevenue: settled ? 194.7 : 120, netRevenue: settled ? 194.7 : 120,
        paidOrders: settled ? 3 : 2, averageTicket: settled ? 64.9 : 60 } });
    });
    await page.goto('/admin/');
    await signIn(page);
    await page.getByRole('button', { name: module, exact: true }).click();
    if (module === 'Financeiro') {
      await expect(page.locator('section.owner-kpi-hero').filter({ has: page.getByRole('heading', { name: 'Receita confirmada', exact: true }) })
        .locator('.owner-display')).toContainText('120,00');
    } else {
      await expect(page.getByText(/2 pagamentos aprovados ·/)).toBeVisible();
    }
    const before = summaryReads;
    settled = true;
    await page.clock.fastForward(16000);
    await expect.poll(() => summaryReads).toBeGreaterThan(before);
    if (module === 'Financeiro') {
      await expect(page.locator('section.owner-kpi-hero').filter({ has: page.getByRole('heading', { name: 'Receita confirmada', exact: true }) })
        .locator('.owner-display')).toContainText('194,70');
    } else {
      await expect(page.getByText(/3 pagamentos aprovados ·/)).toBeVisible();
    }
  });
}

test("login inválido, sessão recuperada e logout com o token do Owner", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/");
  await signIn(page, "senha-incorreta");
  await expect(page.getByText("Credenciais inválidas.")).toBeVisible();
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Evolução de Vendas" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Evolução de Vendas" })).toBeVisible();
  await page.getByRole("button", { name: "Menu do proprietário" }).click();
  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
});

test("cozinha, expedição e entrega enviam status esperado e preservam pagamento", async ({ page }) => {
  // The three reversible actions each wait five seconds before persisting.
  test.setTimeout(45_000);
  const { mutations } = await fixture(page);
  await page.goto("/admin/");
  await signIn(page);
  await page.getByRole("button", { name: /^Cozinha(?:\s|$)/ }).first().click();
  await page.getByRole("button", { name: "Iniciar Preparo na Chapa" }).click();
  await expect.poll(() => mutations.length, { timeout: 8000 }).toBe(1);
  expect(mutations[0]).toEqual({ expectedStatus: "Received", status: "Preparing" });
  await page.getByLabel("Fila da cozinha").selectOption("Preparing");
  await page.getByRole("button", { name: "Marcar como Pronto (Expedição)" }).click();
  await expect.poll(() => mutations.length, { timeout: 8000 }).toBe(2);
  expect(mutations[1]).toEqual({ expectedStatus: "Preparing", status: "ReadyForPickup" });
  await page.getByRole("button", { name: /^Expedição(?:\s|$)/ }).first().click();
  const release = page.getByRole("button", { name: /Liberar para Motoboy/ });
  await expect(release).toBeDisabled();
  await page.getByRole("button", { name: /O Praiano/ }).click();
  await page.getByLabel("Embalagem conferida").check();
  await expect(release).toBeDisabled();
  await page.getByLabel("Identificação conferida").check();
  await release.click();
  await expect.poll(() => mutations.length).toBe(3);
  expect(mutations[2]).toEqual({
    expectedStatus: "ReadyForPickup",
    status: "OutForDelivery",
    checklist: { items: true, packaging: true, identification: true },
  });
  await page.getByRole("button", { name: /^Entregas(?:\s|$)/ }).first().click();
  await page.getByRole("button", { name: "Confirmar Entrega Realizada" }).click();
  await expect.poll(() => mutations.length, { timeout: 8000 }).toBe(4);
  expect(mutations[3]).toEqual({ expectedStatus: "OutForDelivery", status: "Completed" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Confirmar Entrega Realizada" })).toHaveCount(0);
});

test("o Owner móvel abre a navegação e alterna o tema por teclado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto("/admin/");
  await signIn(page);
  const navbar = page.getByRole("banner").filter({ has: page.getByRole("button", { name: "Abrir menu lateral" }) });
  const theme = navbar.getByRole("button", { name: "Alternar para tema escuro" });
  await theme.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const darkToggle = navbar.getByRole("button", { name: "Alternar para tema claro" });
  await darkToggle.click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  const open = page.getByRole("button", { name: "Abrir menu lateral" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Fechar menu lateral");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("navigation", { name: "Módulos administrativos" }).getByRole("button", { name: "Configurações", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await open.click();
  await page.getByRole("button", { name: "Financeiro", exact: true }).click();
  await expect(page.getByText("Auditoria financeira", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    navbar: [...document.querySelectorAll("header > div, header > div > div, header [role=tablist]")].map(node => {
      const rect = node.getBoundingClientRect();
      return [node.tagName, node.className, Math.round(rect.x), Math.round(rect.width), getComputedStyle(node).display];
    }),
    outside: [...document.querySelectorAll("body *")]
      .filter(node => node.getBoundingClientRect().right > 391)
      .slice(0, 8).map(node => [node.tagName, node.getAttribute("class")]),
  }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(390);
});

test("navegação compacta mantém canais por teclado e agenda na barra superior", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/orders");
  await signIn(page);

  const channels = page.getByRole("group", { name: "Canal de atendimento" });
  const all = channels.getByRole("radio", { name: "Todos", exact: true });
  await expect(all).toBeChecked();
  await expect(channels.getByRole("radio")).toHaveCount(3);
  await expect(page.getByText("Densidade", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table").getByText(order.customerName, { exact: true })).toBeVisible();

  const sidebar = page.getByRole("complementary", { name: "Navegação administrativa" });
  const modules = sidebar.getByRole("navigation", { name: "Módulos administrativos" });
  await expect(modules.getByRole("button")).toHaveCount(12);
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar).toHaveCSS("width", "76px");
  const shortcuts = page.getByRole("navigation", { name: "Atalhos do painel" });
  await expect(shortcuts).toHaveCount(0);
  await expect(modules.getByRole("button", { name: "Pedidos", exact: true })).toHaveAttribute("aria-current", "page");
  await modules.getByRole("button", { name: "Cardápio", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await modules.getByRole("button", { name: "Pedidos", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  const current = sidebar.getByRole("button", { name: "Pedidos", exact: true });
  await page.mouse.move(0, 0);
  await current.hover();
  const tooltip = page.locator("[data-sidebar-tooltip]");
  await expect(tooltip).toContainText("Pedidos");
  const [sidebarBox, tooltipBox] = await Promise.all([sidebar.boundingBox(), tooltip.boundingBox()]);
  expect(tooltipBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width);
  await expect(tooltip.locator(".owner-sidebar-badge")).toHaveText("1");
  await current.focus();
  await expect(tooltip).toContainText("Pedidos");
  await expect(current).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sidebar-tooltip]")).toHaveCount(0);
  await modules.getByRole("button", { name: "Configurações", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(sidebar).toHaveCSS("width", "76px");
  await current.click();
  await sidebar.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(sidebar).not.toHaveAttribute("data-collapsed", "true");
  await expect(sidebar).toHaveCSS("width", "250px");
  await sidebar.getByRole("button", { name: "Recolher barra lateral" }).click();
  await expect(sidebar).toHaveCSS("width", "76px");
  await expect(page).toHaveURL(/\/admin\/orders$/);

  await all.focus();
  await page.keyboard.press("ArrowRight");
  await expect(channels.getByRole("radio", { name: "Delivery" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(channels.getByRole("radio", { name: "Balcão" })).toBeChecked();
  await expect(page.getByText("Nenhum pedido corresponde a estes filtros.")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("table").getByText(order.customerName, { exact: true })).toBeVisible();

  const agenda = page.getByRole("banner").getByRole("button", { name: "Abrir agenda" });
  await agenda.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Agenda Administrativa" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(agenda).toBeFocused();
});

for (const count of [1, 20]) test(`Visão Geral mantém grade 12, cinco KPIs e altura natural com ${count} pedidos`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  const items = Array.from({ length: count }, (_, index) => ({
    ...mockData("orders/108"),
    order: { ...order, id: index + 108, createdAt: new Date().toISOString() },
  }));
  await page.route(url => url.pathname === "/api/admin/orders/operational", route =>
    route.fulfill({ json: { items, total: count, pageNumber: 1, pageSize: 20 } }));
  await page.route(url => url.pathname === "/api/admin/dashboard", route =>
    route.fulfill({ json: { ...mockData("dashboard"), orderCounts: [
      { status: "Received", channel: "delivery", count }, { status: "Completed", channel: "delivery", count: 7 },
    ] } }));
  await page.goto("/admin/");
  await signIn(page);
  const indicators = page.getByRole("region", { name: "Indicadores do dia" });
  const table = page.getByRole("table", { name: "Pedidos ativos mais recentes do dia" });
  await expect(indicators.getByRole("article")).toHaveCount(5);
  await expect(table.getByRole("rowheader")).toHaveCount(count);
  const kpis = await indicators.getByRole("article").evaluateAll(nodes => nodes.map(node => ({
    top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height,
  })));
  expect(Math.max(...kpis.map(row => row.height)) - Math.min(...kpis.map(row => row.height))).toBeLessThan(1);
  expect(new Set(kpis.map(row => row.top)).size).toBe(1);
  const pipeline = page.getByRole("region", { name: "Pipeline operacional" });
  await expect(pipeline.getByRole("button")).toHaveText([/Fila/, /Na chapa/, /Conferência/, /Em rota/, /Concluído/]);
  const metrics = await page.evaluate(() => {
    const action = document.querySelector(".owner-overview-action-row");
    const trend = document.querySelector(".owner-overview-trend-row");
    const scroll = document.querySelector(".owner-overview-orders-scroll");
    return {
      columns: [action, trend].map(node => getComputedStyle(node).gridTemplateColumns.split(" ").length),
      spans: [action, trend].map(node => [...node.children].map(child => getComputedStyle(child).gridColumnStart)),
      scrolling: scroll.scrollHeight > scroll.clientHeight,
      clientHeight: scroll.clientHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(metrics.columns).toEqual([12, 12]);
  expect(metrics.spans).toEqual([["span 8", "span 4"], ["span 8", "span 4"]]);
  expect(metrics.overflow).toBe(false);
  expect(metrics.scrolling).toBe(count === 20);
  if (count === 1) expect(metrics.clientHeight).toBeLessThan(150);
  await expect(page.getByRole("heading", { name: "Movimento da hamburgueria" })).toHaveCount(0);
  await pipeline.getByRole("button", { name: /Concluído/ }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.getByRole("button", { name: /^Concluído \(7\)$/ })).toHaveAttribute("aria-pressed", "true");
});

for (const limit of [0, 180]) test(`atraso usa limite ${limit} e Alertas mostra apenas ocorrências acionáveis`, async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T22:00:00Z"));
  await fixture(page);
  const createdAt = "2026-11-18T18:16:00Z";
  const current = { ...order, createdAt, stageStartedAt: createdAt };
  const rows = [{ ...mockData("orders/108"), order: current }];
  if (limit) rows.push({ ...mockData("orders/108"), order: {
    ...current, id: 109, status: "PendingPayment", paymentStatus: "Pending",
  } });
  await page.route(url => url.pathname === "/api/admin/orders/operational", route =>
    route.fulfill({ json: { items: rows, total: rows.length, pageNumber: 1, pageSize: 20 } }));
  await page.route(url => url.pathname === "/api/admin/operation/settings", route =>
    route.fulfill({ json: { revision: 0, limits: { preparing: limit, readyForPickup: 0, outForDelivery: 0, pendingPaymentAgeHours: 2 } } }));
  await page.route(url => url.pathname === "/api/admin/dashboard", route =>
    route.fulfill({ json: { ...mockData("dashboard"), orderCounts: [
      { status: "Received", channel: "delivery", count: 1 },
      { status: "PendingPayment", channel: "delivery", count: limit ? 1 : 0 },
    ] } }));
  await page.route(url => url.pathname === "/api/admin/stock", route =>
    route.fulfill({ json: limit ? [{ id: 1, name: "Pão", unit: "un", quantity: 1, minimum: 3, revision: 1 }] : [] }));
  await page.goto("/admin/");
  await signIn(page);
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Atrasados / Tempo médio" }) });
  await expect(card).toContainText("224 min");
  await expect(card).toContainText("Média na etapa");
  const alerts = page.getByRole("region", { name: "Alertas" });
  if (limit === 0) {
    await expect(card).toHaveAttribute("data-state", "neutral");
    await expect(card).toContainText("Limite de atraso desativado");
    await expect(card).not.toHaveAttribute("data-alert");
    await expect(alerts).toContainText("Tudo em ordem");
    await expect(alerts.getByRole("button", { name: /Estoque abaixo/ })).toHaveCount(0);
    await expect(alerts.getByRole("button", { name: /Pagamento pendente/ })).toHaveCount(0);
  } else {
    await expect(card).toHaveAttribute("data-state", "warning");
    await expect(card).toContainText("Limite por etapa: 180 min");
    await expect(card).not.toHaveAttribute("data-alert");
    await expect(card.locator('.owner-kpi-state-label')).toHaveText('Atenção');
    await expect(alerts.getByRole("button", { name: /Pedidos atrasados na cozinha/ })).toHaveText(/1$/);
    await expect(alerts.getByRole("button", { name: /Pagamento pendente há 2 h/ })).toHaveText(/1$/);
    await expect(alerts.getByRole("button", { name: /Estoque abaixo do mínimo/ })).toHaveText(/1$/);
    await expect(alerts.getByText("Tudo em ordem")).toHaveCount(0);
  }
  await alerts.getByRole("button", { name: "Pausar item" }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
});

test("gráfico de vendas usa os valores da API no filtro, na tabela e nos tooltips", async ({ page }) => {
  await fixture(page);
  const requests = [];
  let failedRequest = false;
  await page.route(url => url.pathname === "/api/admin/finance/revenue", route => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    if (query.get("period") === "30d" && !failedRequest) {
      failedRequest = true;
      return route.fulfill({ status: 503, json: { error: "Receita temporariamente indisponível." } });
    }
    const points = query.get("granularity") === "hour" ? [
      { date: "2026-11-17T18:00", revenue: 0 },
      { date: "2026-11-17T19:00", revenue: 137.25 },
    ] : query.get("period") === "30d" ? [] : [
      { date: "2026-11-11", revenue: 42.5 },
      { date: "2026-11-17", revenue: 137.25 },
    ];
    return route.fulfill({ json: points });
  });
  await page.goto("/admin/");
  await signIn(page);

  const sales = page.locator(".owner-overview-sales");
  const filter = sales.getByRole("group", { name: "Período de vendas" });
  const graph = sales.locator("svg[role=application]");
  const tooltip = sales.locator(".owner-revenue-tooltip");
  await expect(filter.getByRole("radio", { name: "7 dias", exact: true })).toBeChecked();
  await filter.getByText("Hoje", { exact: true }).click();
  await expect(graph).toBeVisible();
  expect(requests.at(-1).get("granularity")).toBe("hour");
  await expect(graph.locator("linearGradient stop")).toHaveCount(3);
  await page.mouse.move(0, 0);
  await filter.getByRole("radio", { name: "Hoje", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(graph).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tooltip).toContainText(/R\$\s*0,00/);
  await page.keyboard.press("ArrowRight");
  await expect(tooltip).toContainText(/R\$\s*137,25/);
  await filter.getByRole("radio", { name: "Hoje", exact: true }).focus();
  await graph.locator(".recharts-bar-rectangle path[fill^='url(']").last().hover();
  await expect(tooltip).toContainText("17/11/2026 · 19:00");
  await expect(tooltip).toContainText(/R\$\s*137,25/);

  await sales.getByText("Ver dados em tabela", { exact: true }).click();
  const table = sales.getByRole("table", { name: "Receita bruta no período" });
  await expect(table.getByRole("columnheader", { name: "Hora" })).toBeVisible();
  await expect(table.getByRole("rowheader")).toHaveText(["18:00", "19:00"]);
  await expect(table.getByRole("cell")).toHaveText([/R\$\s*0,00/, /R\$\s*137,25/]);

  await filter.getByText("7 dias", { exact: true }).click();
  await expect(graph).toBeVisible();
  await sales.getByText("Ver dados em tabela", { exact: true }).click();
  await expect(table.getByRole("columnheader", { name: "Data" })).toBeVisible();
  await expect(table.getByRole("rowheader")).toHaveText(["11/11/2026", "17/11/2026"]);
  expect(requests.at(-1).get("period")).toBe("7d");
  expect(requests.at(-1).has("granularity")).toBe(false);
  await expect(table.getByRole("cell")).toHaveText([/R\$\s*42,50/, /R\$\s*137,25/]);

  await filter.getByText("30 dias", { exact: true }).click();
  await expect(sales.getByRole("alert")).toBeVisible();
  await sales.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(sales.getByText("Sem vendas no período.")).toBeVisible();
  await expect(graph).toHaveCount(0);
  await expect(sales.getByText("Ver dados em tabela", { exact: true })).toHaveCount(0);
});

test("donut concilia categorias e responde ao período e canal da Visão Geral", async ({ page }) => {
  await fixture(page);
  const calls = [];
  let pickupFailure = true;
  const empty = { categories: [], grossRevenue: 0, unclassifiedRevenue: 0, deliveryFees: 0, unallocatedPayments: 0, refundedAmount: 0 };
  const report = {
    categories: [{ category: "menu", revenue: 60 }, { category: "drinks", revenue: 20 }, { category: "sides", revenue: 10 }],
    grossRevenue: 112, unclassifiedRevenue: 10, deliveryFees: 5, unallocatedPayments: 7, refundedAmount: 4,
  };
  await page.route(url => url.pathname === "/api/admin/dashboard", route =>
    route.fulfill({ json: { ...mockData("dashboard"), orderCounts: [] } }));
  await page.route(url => url.pathname === "/api/admin/finance/revenue-by-category", route => {
    const { searchParams } = new URL(route.request().url());
    const period = searchParams.get("period");
    const channel = searchParams.get("channel");
    calls.push([period, channel]);
    if (channel === "pickup" && pickupFailure) {
      pickupFailure = false;
      return route.fulfill({ status: 503, json: {} });
    }
    const response = channel === "pickup" ? empty : period === "30d"
      ? { ...empty, unclassifiedRevenue: 23.5, grossRevenue: 23.5 } : report;
    return route.fulfill({ json: response });
  });
  await page.goto("/admin/");
  await signIn(page);
  const panel = page.getByRole("region", { name: "Faturamento por categoria" });
  const chart = panel.locator("svg[role=application]");
  const legend = panel.getByRole("list", { name: "Valores por categoria" });
  const tooltip = panel.locator(".owner-revenue-tooltip");
  await expect(chart).toBeVisible();
  await expect(panel.locator(".owner-category-total")).toContainText(/R\$\s*100,00/);
  await expect(legend.getByRole("listitem")).toHaveText([
    /Hambúrgueres.*60,00.*60%/, /Bebidas.*20,00.*20%/, /Acompanhamentos.*10,00.*10%/, /Sem categoria histórica.*10,00.*10%/,
  ]);
  await expect(chart.locator("linearGradient stop")).toHaveCount(8);
  await chart.focus();
  await expect(tooltip).toContainText("Hambúrgueres");
  await page.keyboard.press("ArrowRight");
  await expect(tooltip).toContainText(/Bebidas.*20,00.*20%/);
  const thirdSlice = chart.locator("path.recharts-sector").nth(2);
  await thirdSlice.scrollIntoViewIfNeeded();
  const pointer = await thirdSlice.evaluate(path => {
    const box = path.getBBox();
    for (const fx of [0.5, 0.25, 0.75]) {
      for (const fy of [0.5, 0.25, 0.75]) {
        const point = new DOMPoint(box.x + box.width * fx, box.y + box.height * fy);
        if (path.isPointInFill(point)) return point.matrixTransform(path.getScreenCTM()).toJSON();
      }
    }
    throw new Error("Nenhum ponto encontrado na fatia.");
  });
  await page.mouse.move(pointer.x, pointer.y);
  await expect(tooltip).toContainText(/Acompanhamentos.*10,00.*10%/);
  await panel.getByRole("button", { name: "Ver conciliação no Financeiro" }).click();
  await expect(page).toHaveURL(/\/admin\/finance$/);
  await expect(page.getByRole("combobox", { name: "Período", exact: true })).toHaveValue("7d");
  const reconciliation = page.getByRole("region", { name: "Conciliação de produtos e pagamentos" });
  await reconciliation.getByText("Ver conciliação", { exact: true }).click();
  await expect(reconciliation.locator("dl")).toContainText(/Receita bruta no FinanceiroR\$\s*112,00/);
  await expect(reconciliation.locator("dl")).toContainText(/Frete identificadoR\$\s*5,00/);
  await expect(reconciliation.locator("dl")).toContainText(/Estornos registrados no períodoR\$\s*4,00/);
  await page.getByRole("button", { name: "Visão Geral", exact: true }).click();
  await expect(chart).toBeVisible();

  await page.getByRole("group", { name: "Período de vendas" }).getByText("30 dias", { exact: true }).click();
  await expect(panel).toContainText(/Vendas sem categoria histórica.*23,50/);
  await expect(chart).toHaveCount(0);
  expect(calls.at(-1)).toEqual(["30d", null]);
  await page.getByRole("group", { name: "Canal de atendimento" }).getByText("Balcão", { exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("HTTP 503");
  await panel.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(panel).toContainText("Sem faturamento de produtos no período.");
  expect(calls.at(-1)).toEqual(["30d", "pickup"]);
  await expect(page.getByRole("region", { name: "Pipeline operacional" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolução de vendas" })).toBeVisible();
});

test("movimento alterna a grade semanal e o calendário com totais e pico", async ({ page }) => {
  await fixture(page);
  const calls = [];
  await page.route(url => url.pathname === "/api/admin/orders/movement", route => {
    const month = new URL(route.request().url()).searchParams.get("month");
    calls.push(month);
    return route.fulfill({ json: {
      start: month === "2026-10" ? "2026-10-01" : month ? "2026-11-01" : "2026-10-22",
      end: month === "2026-10" ? "2026-10-31" : month ? "2026-11-30" : "2026-11-18",
      today: "2026-11-18", schedule: null,
      hours: month === "2026-10" ? [] : [
        { date: "2026-11-09", hour: 19, count: 3 }, { date: "2026-11-09", hour: 20, count: 2 },
        { date: "2026-11-16", hour: 21, count: 1 },
      ],
    } });
  });
  await page.goto("/admin/reports");
  await signIn(page);
  const panel = page.getByRole("region", { name: "Movimento da hamburgueria" });
  const weekly = panel.getByRole("group", { name: "Mapa por dia e horário" });
  const tooltip = panel.getByRole("status");
  await expect(weekly).toBeVisible();
  await expect(tooltip).toHaveText("6 pedidos no período");
  const band = weekly.getByRole("button", { name: /Segunda-feira · 18h–21h · 5 pedidos/ });
  await band.hover();
  await expect(tooltip).toContainText("83,3% do total");
  await band.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tooltip).toContainText("Terça-feira · 18h–21h");

  const monthlyToggle = panel.getByRole("radio", { name: "Dia e horário" });
  await monthlyToggle.focus();
  await page.keyboard.press("ArrowRight");
  const calendar = panel.getByRole("group", { name: "Calendário de movimento" });
  const day = calendar.getByRole("button", { name: /9 de novembro.*5 pedidos/ });
  await day.click();
  await expect(tooltip).toContainText("Pico 19h–20h · 3");
  await expect(calendar.getByRole("button", { name: /30 de novembro.*Dia futuro/ })).toBeVisible();
  await panel.getByRole("button", { name: "Mês anterior" }).click();
  await expect(panel.getByText("outubro de 2026", { exact: true })).toBeVisible();
  await expect(tooltip).toHaveText("Sem pedidos no período.");
  await panel.getByText("Dia e horário", { exact: true }).click();
  await expect(weekly).toBeVisible();
  expect(calls).toEqual([null, "current", "2026-10"]);
});

test("relatório exporta CSV a partir da receita retornada pela API de teste", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/");
  await signIn(page);
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await expect(page.getByText("Receita bruta por data", { exact: true })).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk.toString();
  expect(csv).toBe("Data;ReceitaBruta\r\n2026-10-04;0.00\r\n2026-10-05;120.00");
});

test("não envia localização quando o dispositivo nega a permissão", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await page.goto("/admin/courier/108#" + "a".repeat(64));
  const origin = new URL(page.url()).origin;
  await cdp.send("Browser.setPermission", { permission: { name: "geolocation" }, setting: "denied", origin });
  const positions = [];
  await page.route("**/api/courier/tracking/108", route => {
    if (route.request().method() === "PUT" || route.request().method() === "POST") positions.push(route.request().method());
    return route.fulfill({ status: 204 });
  });
  await page.getByRole("button", { name: "Compartilhar minha localização" }).click();
  await expect(page.getByText(/Permissão negada/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/courier\/108$/);
  expect(positions).toEqual([]);
});

test("Cardápio edita uma classificação válida e mantém rótulos de descrição ao recarregar", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/products");
  await signIn(page);
  await expect(page).toHaveURL(/\/admin\/products$/);
  await page.getByRole("button", { name: "Editar O Praiano", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Descrição do produto", { exact: true })).toHaveValue(/carne|queijo/i);
  await expect(dialog.getByLabel("Descrição em inglês", { exact: true })).toBeVisible();
  await dialog.getByLabel("Categoria", { exact: true }).selectOption("sides");
  await dialog.getByLabel("Ordem Exibição").fill("0");
  await dialog.getByLabel("Descrição do produto", { exact: true }).fill("Descrição de teste");
  await dialog.getByLabel("Descrição em inglês").fill("Test description");
  const saved = page.waitForRequest(request => request.method() === "PATCH" && request.url().endsWith("/api/admin/products/1"));
  await dialog.getByRole("button", { name: "Salvar Item" }).click();
  expect((await saved).postDataJSON()).toMatchObject({ category: "sides", displayOrder: 0, isActive: true, englishDescription: "Test description" });
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Editar O Praiano", exact: true }).click();
  await expect(dialog.getByLabel("Categoria", { exact: true })).toHaveValue("sides");
  await expect(dialog.getByLabel("Descrição do produto", { exact: true })).toHaveValue("Descrição de teste");
});

test("Configurações usa revisão e a troca de senha exige confirmação", async ({ page }) => {
  const { calls } = await fixture(page);
  await page.goto("/admin/security");
  await signIn(page);
  await page.getByLabel("Em preparo", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Configurações confirmadas pelo servidor.")).toBeVisible();
  await page.getByLabel("Preferência de tema").selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.getByLabel("Preferência de tema")).toHaveValue("system");
  await expect(page.getByLabel("Em preparo", { exact: true })).toHaveValue("20");
  await page.getByLabel("Senha atual", { exact: true }).fill("synthetic-test-password");
  await page.getByLabel("Nova senha", { exact: true }).fill("nova-senha-sintetica");
  await page.getByLabel("Confirmar nova senha").fill("confirmacao-incorreta");
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page.getByText("As novas senhas não coincidem.")).toBeVisible();
  expect(calls.some(call => call.path === "auth/change-password")).toBe(false);
  await page.getByLabel("Confirmar nova senha").fill("nova-senha-sintetica");
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await signIn(page, "nova-senha-sintetica");
  await expect(page.getByRole("heading", { name: "Evolução de Vendas" })).toBeVisible();
});

test("Pedidos e Financeiro enviam filtros ao servidor e mantêm a rota após recarga", async ({ page }) => {
  const { calls } = await fixture(page);
  await page.goto("/admin/orders");
  await signIn(page);
  await page.getByRole("button", { name: /^Recebido \(/ }).click();
  await page.getByRole("searchbox", { name: "Buscar pedidos" }).fill("#108");
  await expect.poll(() => calls.some(call => call.path === "orders/operational"
    && call.query.get("Status") === "Received" && call.query.get("Search") === "#108")).toBe(true);
  await page.getByRole("button", { name: "Financeiro", exact: true }).click();
  await page.getByRole("combobox", { name: "Período", exact: true }).selectOption("custom");
  await page.getByLabel("Início do período").fill("2026-10-04");
  await page.getByLabel("Fim do período").fill("2026-10-05");
  await page.getByRole("button", { name: "Filtrar período" }).click();
  await expect.poll(() => calls.some(call => call.path === "finance/summary"
    && call.query.get("period") === "custom" && call.query.get("start") === "2026-10-04"
    && call.query.get("end") === "2026-10-05")).toBe(true);
  await page.reload();
  await expect(page.getByText("Auditoria financeira", { exact: true })).toBeVisible();
});

test("retoma notificações paginadas após reconexão e permite ler e dispensar", async ({ page }) => {
  await fixture(page);
  const items = Array.from({ length: 51 }, (_, index) => ({ id: 150 - index, approvedAt: "2026-10-05T21:01:00Z", read: false }));
  let firstReads = 0;
  await page.route("**/api/admin/notifications/inbox**", route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PUT") {
      if (url.pathname.endsWith("/archive")) items.splice(items.findIndex(item => item.id === Number(url.pathname.split("/").at(-2))), 1);
      else items.forEach(item => { item.read = true; });
      return route.fulfill({ status: 204 });
    }
    const before = Number(url.searchParams.get("beforeId") || Infinity);
    if (!Number.isFinite(before)) firstReads++;
    const visible = items.filter(item => item.id < before);
    return route.fulfill({ json: { beforeId: visible.length > 50 ? visible[49].id : null,
      unreadCount: items.filter(item => !item.read).length, items: visible.slice(0, 50) } });
  });
  await page.goto("/admin/");
  await signIn(page);
  const trigger = page.getByRole("button", { name: /Notificações.*51/ });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => firstReads).toBeGreaterThan(1);
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Notificações" });
  await drawer.getByRole("button", { name: "Carregar mais notificações" }).click();
  await expect(drawer.getByRole("button", { name: /^Dispensar notificação/ })).toHaveCount(51);
  await drawer.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await expect(drawer.getByLabel("Não lida")).toHaveCount(0);
  await drawer.getByRole("button", { name: /^Dispensar notificação/ }).first().click();
  await expect(drawer.getByRole("button", { name: /^Dispensar notificação/ })).toHaveCount(50);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Notificações", exact: true })).toBeFocused();
});

test("pedido direto não mostra ação de cozinha para pagamento pendente", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/admin/orders/108", route => {
    const detail = mockData("orders/108");
    detail.order.status = "PendingPayment";
    detail.order.paymentStatus = "Pending";
    return route.fulfill({ json: detail });
  });
  await page.goto("/admin/orders/108");
  await signIn(page);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Pedido #108" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar para Cozinha" })).toHaveCount(0);
});

test("rotas antigas mantêm pedidos e cardápio acessíveis quando módulos novos retornam 404", async ({ page }) => {
  await fixture(page);
  for (const endpoint of ["orders/operational?*", "customers", "notifications/inbox"])
    await page.route("**/api/admin/" + endpoint, route => route.fulfill({ status: 404 }));
  await page.goto("/admin/");
  await signIn(page);
  await expect(page.getByRole("table").getByText(order.customerName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Notificações" });
  await expect(drawer.getByRole("alert")).toContainText("HTTP 404");
  await expect(drawer.getByText("Nenhuma notificação no momento")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/admin/kitchen");
  await expect(page.getByRole("button", { name: "Iniciar Preparo na Chapa" })).toBeVisible();
  await page.goto("/admin/products");
  await expect(page.getByRole("button", { name: /^Editar / }).first()).toBeVisible();
  await page.goto("/admin/customers");
  await expect(page.getByRole("alert")).toContainText("HTTP 404");
});

test("auditoria indisponível mantém Financeiro e Relatórios acessíveis", async ({ page }, info) => {
  await fixture(page);
  await page.route("**/api/admin/finance/audit?*", route => route.fulfill({ status: 503 }));
  await page.goto("/admin/finance");
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText("Auditoria indisponível");
  await expect(page.getByRole("heading", { name: "Auditoria financeira" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("financeiro-auditoria-indisponivel.png"), animations: "disabled" });
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Receita bruta por data" })).toBeVisible();
});

test("aprovação nova na caixa atualiza a fila operacional", async ({ page }) => {
  const { calls } = await fixture(page);
  let approved = false;
  await page.route("**/api/admin/notifications/inbox", route => route.fulfill({
    json: {
      unreadCount: approved ? 1 : 0, beforeId: null,
      items: approved ? [{ id: order.id, approvedAt: order.createdAt, read: false }] : [],
    },
  }));
  await page.goto("/admin/kitchen");
  await signIn(page);
  await expect(page.getByRole("button", { name: "Iniciar Preparo na Chapa" })).toBeVisible();
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  await expect(page.getByText("Nenhuma notificação no momento")).toBeVisible();
  await page.keyboard.press("Escape");
  const queueReads = () => calls.filter(call => call.path === "orders/operational").length;
  const previous = queueReads();
  approved = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: /Notificações.*1/ })).toBeVisible();
  await expect.poll(queueReads).toBeGreaterThan(previous);
});

test("fila conserva 15 pedidos e atualiza a consulta quando o servidor rejeita uma revisão concorrente", async ({ page }) => {
  await fixture(page);
  const paid = Array.from({ length: 15 }, (_, index) => ({ ...order, id: 108 + index }));
  let conflicts = 0;
  let failedOnce = false;
  let detailRequests = 0;
  await page.route("**/api/admin/orders/operational?*", route => {
    if (!failedOnce) {
      failedOnce = true;
      return route.fulfill({ status: 503 });
    }
    const query = new URL(route.request().url()).searchParams;
    const rows = query.get("Status") === "Received" ? paid.slice(conflicts ? 1 : 0) : [];
    const items = rows.map(order => ({ ...mockData("orders/108"), order }));
    return route.fulfill({ json: { items, total: items.length, pageSize: 20, pageNumber: 1 } });
  });
  await page.route(/\/api\/admin\/orders\/\d+$/, route => {
    detailRequests++;
    return route.fulfill({ status: 503 });
  });
  await page.route("**/api/admin/orders/108/status", route => {
    expect(route.request().postDataJSON()).toEqual({ expectedStatus: "Received", status: "Preparing" });
    conflicts++;
    return route.fulfill({ status: 409, json: { error: "Fixture de concorrência." } });
  });
  await page.goto("/admin/kitchen");
  await signIn(page);
  const start = page.getByRole("button", { name: "Iniciar Preparo na Chapa" });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(start).toHaveCount(15);
  await start.first().click();
  await expect(page.getByText("Pedido não atualizado")).toBeVisible({ timeout: 8000 });
  await expect(start).toHaveCount(14);
  expect(conflicts).toBe(1);
  expect(detailRequests).toBe(0);
});

test("V16 metálicos preservam indicadores, notificações e busca por teclado", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  await page.goto("/admin/");
  await signIn(page);
  const navbar = page.getByRole("banner").locator(".owner-navbar");
  const cards = page.locator(".owner-overview .owner-kpi-hero");
  await expect(cards).toHaveCount(5);
  const captureKpis = async (theme, mode) => {
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const box = await page.locator('.owner-overview-kpis').boundingBox();
    await page.screenshot({ path: info.outputPath(`v16-kpis-${theme}-${mode}.png`),
      clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
  };
  for (const icon of await page.getByRole("region", { name: "Pipeline operacional" }).locator("svg").all()) {
    await expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
  }
  for (const theme of ["claro", "escuro"]) {
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect.poll(() => cards.evaluateAll(nodes => nodes.every(node => {
      const box = node.getBoundingClientRect();
      const svg = node.querySelector('.owner-kpi-metal');
      return Math.abs(svg.viewBox.baseVal.width - box.width) < .2 && Math.abs(svg.viewBox.baseVal.height - box.height) < .2;
    }))).toBe(true);
    const sidebar = page.getByRole("complementary", { name: "Navegação administrativa" });
    await expect(sidebar).toBeVisible();
    await expect(navbar).toHaveCSS("backdrop-filter", "none");
    for (const card of await cards.all()) {
      await expect(card).toHaveCSS("clip-path", "none");
      await expect(card.locator(".owner-kpi-metal")).toBeVisible();
      await expect(card.locator(".owner-metric-icon > svg")).toHaveAttribute("viewBox", "0 0 24 24");
      const shape = await card.locator('.owner-kpi-metal').evaluate(svg => {
        const path = svg.querySelector('g > path');
        const { width, height } = svg.viewBox.baseVal;
        return {
          curve: /C/.test(path.getAttribute('d')),
          pocketIsEmpty: !path.isPointInFill(new DOMPoint(width - 26, 18)),
          bodyIsSolid: path.isPointInFill(new DOMPoint(25, height - 25)),
          circleX: +svg.querySelector('circle').getAttribute('cx'), width,
        };
      });
      expect(shape.curve && shape.pocketIsEmpty && shape.bodyIsSolid).toBe(true);
      expect(Math.abs(shape.circleX - (shape.width - 26))).toBeLessThan(.1);
      const aligned = await card.evaluate(node => {
        const svg = node.querySelector('.owner-kpi-metal');
        const circle = svg.querySelector('circle');
        const point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(svg.getScreenCTM());
        const button = node.querySelector('.owner-kpi-arrow').getBoundingClientRect();
        return { dx: point.x - button.x - button.width / 2, dy: point.y - button.y - button.height / 2,
          article: node.getBoundingClientRect().width, svgWidth: svg.getBoundingClientRect().width, viewWidth: svg.viewBox.baseVal.width };
      });
      expect(Math.abs(aligned.dx) < 1 && Math.abs(aligned.dy) < 1, JSON.stringify(aligned)).toBe(true);
    }
    await expect(cards.first()).toHaveCSS("color", theme === 'claro' ? 'rgb(14, 42, 29)' : 'rgb(234, 248, 240)');
    await expect(cards.first()).toHaveAttribute('data-state', 'positive');
    await expect(cards.nth(1)).toHaveAttribute('data-state', 'neutral');
    await expect(cards.nth(2)).toHaveAttribute('data-state', 'neutral');
    await expect(cards.first()).toHaveAttribute("data-surface", "revenue");
    await expect(cards.nth(1)).toHaveAttribute("data-surface", "jade");
    await expect(cards.nth(3)).toHaveAttribute("data-surface", "slate");
    await expect(cards.nth(4)).toHaveAttribute("data-surface", "coral");
    for (const badge of await cards.locator(".owner-metric-icon").all()) {
      await expect(badge).toHaveCSS("border-top-width", "0px");
      await expect(badge).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    const monetaryValues = cards.locator(".owner-display > span[title]");
    for (const money of await monetaryValues.all()) await expect(money).toHaveCSS("white-space", "nowrap");
    await page.evaluate(() => document.fonts.ready);
    await captureKpis(theme, 'desktop');
    await page.screenshot({ path: info.outputPath(`v16-context-${theme}-desktop.png`) });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await cards.first().getByRole('button').hover();
    await expect(cards.first().getByRole('button')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await captureKpis(theme, 'hover');
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(cards.first()).toHaveCSS("transform", "none");
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const readGeometry = () => cards.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      const svg = node.querySelector('.owner-kpi-metal');
      const circle = svg.querySelector('circle');
      const point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(svg.getScreenCTM());
      const button = node.querySelector('.owner-kpi-arrow').getBoundingClientRect();
      return { top: box.top, height: box.height, width: box.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
        overflowing: [...node.querySelectorAll('.owner-kpi-content *')].filter(child => child.getBoundingClientRect().right > box.right + .5).map(child => ({
          tag: child.tagName, text: child.textContent, width: child.getBoundingClientRect().width, font: getComputedStyle(child).fontSize })),
        arrowError: Math.hypot(point.x - button.x - button.width / 2, point.y - button.y - button.height / 2) };
    }));
    await expect.poll(async () => (await readGeometry()).every(box => box.scrollWidth <= box.clientWidth)).toBe(true);
    const geometry = await readGeometry();
    expect(geometry.every(box => Math.abs(box.top - geometry[0].top) < 1 && Math.abs(box.height - geometry[0].height) < 1)).toBe(true);
    expect(geometry.every(box => box.scrollWidth <= box.clientWidth), JSON.stringify(geometry)).toBe(true);
    expect(geometry.every(box => box.arrowError < 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include(".owner-overview-kpis")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await captureKpis(theme, 'tablet');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator("svg filter feDisplacementMap")).toHaveCount(0);
    await page.getByRole("button", { name: /^Notificações/ }).click();
    const drawer = page.getByRole("dialog", { name: "Notificações" });
    await expect(drawer).toBeVisible();
    await page.screenshot({ path: info.outputPath(`owner-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    if (theme === "claro") await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
  }
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Busca global" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Busca global" })).toBeHidden();
  const sidebar = page.getByRole("complementary", { name: "Navegação administrativa" });
  await sidebar.getByRole("button", { name: "Configurações", exact: true }).click();
  const themePreference = page.getByLabel("Preferência de tema");
  await themePreference.selectOption("light");
  await page.reload();
  await expect(themePreference).toHaveValue("light");
});

for (const [before, first, second] of [
  ['04:59:59', 'Boa noite!', 'Bom dia!'],
  ['11:59:59', 'Bom dia!', 'Boa tarde!'],
  ['17:59:59', 'Boa tarde!', 'Boa noite!'],
]) test(`saudação ${before} muda com a página aberta e independe do tema`, async ({ page }) => {
  const instant = new Date(`2026-11-18T${before}-03:00`);
  await page.clock.install({ time: instant });
  await page.clock.pauseAt(instant);
  await fixture(page);
  await page.goto('/admin/');
  await signIn(page);
  const greeting = page.getByRole('heading', { level: 1 });
  await expect(greeting).toHaveText(first);
  await expect(greeting).toHaveAccessibleName(first);
  await page.getByRole('button', { name: 'Alternar para tema escuro' }).click();
  await expect(greeting).toHaveText(first);
  await page.clock.runFor(1000);
  await expect(greeting).toHaveText(second);
  await expect(greeting).toHaveAccessibleName(second);
});

test('limites indisponíveis mantêm V162 neutro e desconhecido sem atraso confirmado', async ({ page }) => {
  await fixture(page);
  await page.route(url => url.pathname === '/api/admin/operation/settings', route =>
    route.fulfill({ status: 503, json: { error: 'Limites indisponíveis.' } }));
  await page.goto('/admin/');
  await signIn(page);
  const card = page.locator('.owner-kpi-attention');
  await expect(card).toHaveAttribute('data-state', 'neutral');
  await expect(card).toHaveAttribute('data-known', 'false');
  await expect(card.locator('.owner-kpi-state-label')).toHaveText('Sem dados');
  await expect(card).toHaveAttribute('data-surface', 'coral');
  await expect(card).not.toHaveAttribute('data-alert');
  await expect(card).toContainText('Limite indisponível');
  const action = card.getByRole('button', { name: 'Conferir cozinha' });
  await action.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(action).toBeFocused();
  await expect(action).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/kitchen$/);
});

test('setas V16 abrem destinos existentes e recebem foco por teclado', async ({ page }) => {
  await fixture(page);
  await page.goto('/admin/');
  await signIn(page);
  for (const name of ['Ver receita de hoje no Financeiro', 'Consultar pagamentos de hoje no Financeiro', 'Ver ticket médio de hoje no Financeiro']) {
    const action = page.getByRole('button', { name, exact: true });
    await action.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(action).toBeFocused();
    await expect(action).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin\/finance$/);
    await expect(page.getByRole('combobox', { name: 'Período', exact: true })).toHaveValue('today');
    await page.getByRole('navigation', { name: 'Módulos administrativos' }).getByRole('button', { name: 'Visão Geral', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Ver pedidos pendentes de pagamento', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.getByRole('button', { name: /^Aguardando pagamento \(/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation', { name: 'Módulos administrativos' }).getByRole('button', { name: 'Visão Geral', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Cozinha — atrasados e tempo médio', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/kitchen$/);
});

test('V16 mantém valores monetários maiores completos em desktop e tablet', async ({ page }, info) => {
  await fixture(page);
  await page.route(url => url.pathname === '/api/admin/dashboard', route => route.fulfill({ json: {
    ...mockData('dashboard'), today: { grossRevenue: 12345.6, paidOrders: 10, averageTicket: 1234.56 },
  } }));
  await page.goto('/admin/');
  await signIn(page);
  const cards = page.locator('.owner-overview-kpis');
  await expect(cards).toContainText('12.345,60');
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const values = await cards.locator('.owner-display > span[title]').evaluateAll(nodes => nodes.map(node => {
      const value = node.getBoundingClientRect(), content = node.closest('.owner-kpi-content').getBoundingClientRect();
      return { text: node.textContent, left: value.left, right: value.right, contentRight: content.right - 18,
        nowrap: getComputedStyle(node).whiteSpace };
    }));
    expect(values.every(value => value.nowrap === 'nowrap' && value.right <= value.contentRight + 1), JSON.stringify(values)).toBe(true);
    const box = await cards.boundingBox();
    await page.screenshot({ path: info.outputPath(`v16-valores-${width}.png`),
      clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
  }
});

const semanticTime = Date.parse('2026-11-19T12:00:00Z');
async function semanticKpiFixture(page, options = {}) {
  await page.clock.setFixedTime(new Date(semanticTime));
  await fixture(page);
  const input = { age: 16, delayed: 3, failOldest: false, pickup: false, hours: undefined, ...options };
  const requests = [];
  const pendingRows = () => [{ ...order, id: 9001, status: 'PendingPayment', paymentStatus: 'Pending', orderType: 'delivery',
    createdAt: new Date(semanticTime - input.age * 60000).toISOString() },
    ...(input.pickup ? [{ ...order, id: 9002, status: 'PendingPayment', paymentStatus: 'Pending', orderType: 'pickup',
      createdAt: new Date(semanticTime - 5 * 60000).toISOString() }] : [])];
  const kitchenRows = () => Array.from({ length: input.delayed + 1 }, (_, i) => ({ ...order, id: 9100 + i,
    status: 'Received', paymentStatus: 'Approved', orderType: 'delivery',
    createdAt: new Date(semanticTime - (i < input.delayed ? 224 : 0) * 60000).toISOString(),
    stageStartedAt: new Date(semanticTime - (i < input.delayed ? 224 : 0) * 60000).toISOString() }));
  await page.route(url => url.pathname === '/api/admin/orders/operational', route => {
    const query = new URL(route.request().url()).searchParams;
    const status = query.get('Status'), channel = query.get('Channel');
    const rows = [...pendingRows(), ...kitchenRows()].filter(row => (!status || row.status === status) && (!channel || row.orderType === channel));
    return route.fulfill({ json: { items: rows.map(row => ({ ...mockData('orders/108'), order: row })),
      total: rows.length, pageNumber: 1, pageSize: 20 } });
  });
  await page.route(url => url.pathname === '/api/admin/orders' && url.searchParams.get('Sort') === 'oldest', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('Status')).toBe('PendingPayment');
    const channel = query.get('Channel');
    requests.push(channel ?? 'all');
    if (input.failOldest) return route.fulfill({ status: 503, json: { error: 'Indisponível no teste.' } });
    const rows = pendingRows().filter(row => !channel || row.orderType === channel)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return route.fulfill({ json: { items: rows, total: rows.length, pageSize: 20, pageNumber: 1 } });
  });
  await page.route(url => url.pathname === '/api/admin/dashboard', route => route.fulfill({ json: {
    ...mockData('dashboard'), orderCounts: [
      { status: 'Received', channel: 'delivery', count: kitchenRows().length },
      { status: 'PendingPayment', channel: 'delivery', count: 1 },
      { status: 'PendingPayment', channel: 'pickup', count: input.pickup ? 1 : 0 },
    ],
  } }));
  await page.route(url => url.pathname === '/api/admin/operation/settings', route => route.fulfill({ json: {
    revision: 0, limits: { preparing: 180, readyForPickup: 0, outForDelivery: 0, pendingPaymentAgeHours: input.hours },
  } }));
  return { input, requests };
}

test('V162 quatro estados metálicos nos dois temas preservam geometria e hierarquia', async ({ page }, info) => {
  await semanticKpiFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/');
  await signIn(page);
  const cards = page.locator('.owner-overview-kpis > article');
  for (const [index, state] of ['positive', 'neutral', 'neutral', 'warning', 'critical'].entries()) {
    await expect(cards.nth(index)).toHaveAttribute('data-state', state);
    await expect(cards.nth(index)).toHaveAttribute('data-known', 'true');
  }
  await expect(cards.nth(3).locator('.owner-kpi-state-label')).toHaveText('Atenção');
  await expect(cards.nth(4).locator('.owner-kpi-state-label')).toHaveText('Crítico');
  for (const theme of ['claro', 'escuro']) {
    if (theme === 'escuro') await page.getByRole('button', { name: 'Alternar para tema escuro' }).click();
    for (const [device, width, height] of [['desktop', 1440, 1000], ['tablet', 1024, 768]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      // Font-dependent geometry can settle after viewport/theme changes. Keep every
      // original limit and wait for the complete layout instead of sampling one frame.
      await expect(async () => {
        const dimensions = await cards.evaluateAll(nodes => nodes.map(node => {
          const rect = node.getBoundingClientRect(), svg = node.querySelector('.owner-kpi-metal');
          const circle = svg.querySelector('circle');
          const center = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(svg.getScreenCTM());
          const button = node.querySelector('.owner-kpi-arrow').getBoundingClientRect();
          const caption = node.querySelector('.owner-kpi-caption').getBoundingClientRect();
          const title = node.querySelector('.owner-label').getBoundingClientRect();
          const icon = node.querySelector('.owner-metric-icon').getBoundingClientRect();
          return { y: rect.y, height: rect.height, span: getComputedStyle(node).gridColumnStart,
            titleY: caption.y, scroll: node.scrollWidth > node.clientWidth,
            scrollPixels: node.scrollWidth - node.clientWidth,
            valueWidth: node.querySelector('.owner-display').getBoundingClientRect().width,
            iconTitleError: Math.abs(title.y - icon.y),
            arrowError: Math.hypot(center.x - button.x - button.width / 2, center.y - button.y - button.height / 2) };
        }));
        expect(dimensions.every(item => Math.abs(item.y - dimensions[0].y) < 1 && Math.abs(item.height - dimensions[0].height) < 1)).toBe(true);
        expect(dimensions.map(item => item.span)).toEqual(['span 2', 'span 2', 'span 2', 'span 2', 'span 4']);
        expect(dimensions.every(item => item.arrowError < 1 && !item.scroll && Math.abs(item.titleY - dimensions[0].titleY) < 1), JSON.stringify({ theme, device, dimensions })).toBe(true);
        expect(dimensions.every(item => item.iconTitleError < 1)).toBe(true);
      }).toPass({ timeout: 5000 });
      const accessibility = await new AxeBuilder({ page }).include('.owner-overview-kpis')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(accessibility.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const box = await page.locator('.owner-overview-kpis').boundingBox();
      await page.screenshot({ path: info.outputPath(`v162-estados-${theme}-${device}.png`),
        clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
    }
  }
});

test('V162 pendência muda ao cruzar 15 e 30 minutos sem nova consulta ou mudança de tamanho', async ({ page }) => {
  const controls = await semanticKpiFixture(page, { age: 15, delayed: 0 });
  await page.goto('/admin/');
  await signIn(page);
  const pending = page.locator('[data-surface="slate"]');
  await expect(pending).toHaveAttribute('data-known', 'true');
  await expect(pending).toHaveAttribute('data-state', 'neutral');
  const original = await pending.evaluate(node => ({ path: node.querySelector('[data-kpi-contour]').getAttribute('d'),
    font: getComputedStyle(node.querySelector('.owner-display')).fontSize, height: node.getBoundingClientRect().height }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const node = document.querySelector('[data-surface="slate"]');
    const stop = node.querySelector('.owner-kpi-metal-mid');
    window.kpiTransitionSamples = [];
    const observer = new MutationObserver(() => {
      if (node.dataset.state !== 'warning') return;
      observer.disconnect();
      window.kpiTransitionSamples.push(getComputedStyle(stop).stopColor);
      setTimeout(() => window.kpiTransitionSamples.push(getComputedStyle(stop).stopColor), 120);
      setTimeout(() => window.kpiTransitionSamples.push(getComputedStyle(stop).stopColor), 350);
    });
    observer.observe(node, { attributes: true, attributeFilter: ['data-state'] });
  });
  await page.clock.setFixedTime(new Date(semanticTime + 60000));
  await expect(pending).toHaveAttribute('data-state', 'warning');
  await expect.poll(() => page.evaluate(() => window.kpiTransitionSamples.length)).toBe(3);
  const samples = await page.evaluate(() => window.kpiTransitionSamples);
  expect(new Set(samples).size).toBe(3);
  await expect(pending.locator('.owner-kpi-metal-mid').first()).toHaveCSS('transition-duration', '0.3s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(semanticTime + 15 * 60000));
  await expect(pending).toHaveAttribute('data-state', 'warning');
  await page.clock.setFixedTime(new Date(semanticTime + 16 * 60000));
  await expect(pending).toHaveAttribute('data-state', 'critical');
  await expect(pending.locator('.owner-kpi-metal-mid').first()).toHaveCSS('transition-duration', '1e-05s');
  expect(await pending.evaluate(node => ({ path: node.querySelector('[data-kpi-contour]').getAttribute('d'),
    font: getComputedStyle(node.querySelector('.owner-display')).fontSize, height: node.getBoundingClientRect().height }))).toEqual(original);
  expect(controls.requests).toEqual(['all']);
});

for (const [hours, age, expected, label] of [[2, 31, 'neutral', ''], [2, 121, 'warning', 'Atenção'], [2, 241, 'critical', 'Crítico'], [0, 300, 'neutral', 'Desativado']]) {
  test(`V162 SLA configurado ${hours} h prevalece sobre ${age} min`, async ({ page }) => {
    await semanticKpiFixture(page, { hours, age, delayed: 0 });
    await page.goto('/admin/');
    await signIn(page);
    const pending = page.locator('[data-surface="slate"]');
    await expect(pending).toHaveAttribute('data-known', 'true');
    await expect(pending).toHaveAttribute('data-state', expected);
    await expect(pending.locator('.owner-kpi-state-label')).toHaveText(label);
  });
}

test('V162 erro da evidência temporal fica desconhecido e recupera sem fallback', async ({ page }) => {
  const controls = await semanticKpiFixture(page, { age: 31, delayed: 0, failOldest: true });
  await page.goto('/admin/');
  await signIn(page);
  const pending = page.locator('[data-surface="slate"]');
  await expect(pending).toHaveAttribute('data-known', 'false');
  await expect(pending).toHaveAttribute('data-state', 'neutral');
  await expect(pending.locator('.owner-kpi-state-label')).toHaveText('Sem dados');
  controls.input.failOldest = false;
  await page.reload();
  await expect(pending).toHaveAttribute('data-known', 'true');
  await expect(pending).toHaveAttribute('data-state', 'critical');
});

test('V162 pendência mais antiga respeita o canal e não reutiliza evidência de outro canal', async ({ page }) => {
  const controls = await semanticKpiFixture(page, { age: 31, delayed: 0, pickup: true });
  await page.goto('/admin/');
  await signIn(page);
  const pending = page.locator('[data-surface="slate"]');
  await expect(pending).toHaveAttribute('data-state', 'critical');
  await page.getByRole('radio', { name: 'Delivery', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: 'Delivery', exact: true })).toBeChecked();
  await expect(pending).toHaveAttribute('data-known', 'true');
  await expect(pending).toHaveAttribute('data-state', 'critical');
  await page.getByRole('radio', { name: 'Balcão', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: 'Balcão', exact: true })).toBeChecked();
  await expect(pending).toHaveAttribute('data-known', 'true');
  await expect(pending).toHaveAttribute('data-state', 'neutral');
  expect(controls.requests).toContain('delivery');
  expect(controls.requests).toContain('pickup');
});

test('V162 aguarda o SLA real sem classificar criticidade durante o carregamento', async ({ page }) => {
  await semanticKpiFixture(page, { age: 300, delayed: 0 });
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route(url => url.pathname === '/api/admin/operation/settings', async route => {
    await ready;
    await route.fulfill({ json: { revision: 0, limits: { preparing: 0, readyForPickup: 0, outForDelivery: 0, pendingPaymentAgeHours: 0 } } });
  });
  await page.goto('/admin/');
  await signIn(page);
  const pending = page.locator('[data-surface="slate"]');
  const kitchen = page.locator('[data-surface="coral"]');
  await expect(pending).toHaveAttribute('data-state', 'neutral');
  await expect(pending).toHaveAttribute('data-known', 'false');
  await expect(kitchen).toHaveAttribute('data-known', 'false');
  await expect(kitchen.locator('.owner-display')).toContainText('—');
  release();
  await expect(pending).toHaveAttribute('data-known', 'true');
  await expect(pending).toHaveAttribute('data-state', 'neutral');
  await expect(pending.locator('.owner-kpi-state-label')).toHaveText('Desativado');
});
