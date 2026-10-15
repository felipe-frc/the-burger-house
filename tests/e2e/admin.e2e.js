import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAdmin, login, navigate } from "./admin-helpers.js";
import { order } from "../admin-fixtures.js";

test("session notifications are accessible, transient and track payment transitions", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-11T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-11T12:00:01Z"));
  await mockAdmin(page);
  await login(page);
  await expect(page.locator("#revenue-chart figure")).toBeVisible();
  const poll = async () => {
    // The chart is updated last in each polling cycle. Do not advance time
    // while its HTTP requests are still in flight.
    await page.evaluate(() => {
      const chart = document.getElementById("revenue-chart");
      chart.dataset.refreshed = "false";
      const observer = new MutationObserver(() => {
        chart.dataset.refreshed = "true";
        observer.disconnect();
      });
      observer.observe(chart, { childList: true });
    });
    await page.clock.fastForward(15000);
    await expect(page.locator("#revenue-chart")).toHaveAttribute("data-refreshed", "true");
  };
  let current = { ...order, id: 109, status: "PendingPayment", paymentStatus: "Pending" };
  await page.route("**/api/admin/orders?**", (route) =>
    route.fulfill({ json: { items: [order, current], total: 2, pageSize: 20, pageNumber: 1 } }),
  );
  await poll();
  await expect(page.locator("#admin-message")).toContainText("Aguardando pagamento");
  await expect(page.locator("#notification-count")).toHaveText("1");
  await page.getByRole("button", { name: "Notificações", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#notifications-panel")).toBeVisible();
  await expect(page.locator("#notification-list")).toContainText("Pedido #109");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const panel = await page.locator("#notifications-panel").boundingBox();
  // Browser transforms can introduce subpixel rounding in boundingBox().
  expect(panel.width).toBeLessThanOrEqual(420 + 0.001);
  expect(panel.height).toBe(page.viewportSize().height);
  if (page.viewportSize().width <= 640) {
    await expect(page.locator("#notifications-overlay")).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#notifications-clear")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#notifications-close")).toBeFocused();
  }
  await page.screenshot({ path: testInfo.outputPath("notifications.png") });
  await page.clock.fastForward(7000);
  await expect(page.locator("#admin-message")).toBeEmpty();
  current = { ...current, status: "Received", paymentStatus: "Approved" };
  await poll();
  await expect(page.locator("#admin-message")).toContainText("Pagamento aprovado");
  await expect(page.locator("#notification-count")).toHaveText("2");
  await page.locator('[data-notification-filter="payments"]').click();
  await expect(page.locator("#notification-list")).not.toContainText("Aguardando pagamento");
  await page.locator('[data-notification-filter="orders"]').click();
  await expect(page.locator("#notification-list")).toContainText("Aguardando pagamento");
  await page.locator('[data-notification-filter="all"]').click();
  await page.locator("#notifications-close").click();
  await page.getByRole("button", { name: "Fechar notificação", exact: true }).click();
  await expect(page.locator("#admin-message")).toBeEmpty();
  await page.locator("#notifications-toggle").click();
  await page.getByRole("button", { name: "Marcar como lidas" }).click();
  await expect(page.locator("#notification-count")).toHaveText("0");
  await page.getByRole("button", { name: "Limpar lista" }).click();
  await poll();
  await expect(page.locator("#notification-list")).toContainText("Nenhuma notificação");
  await page.keyboard.press("Escape");
  await expect(page.locator("#notifications-panel")).toBeHidden();
  await expect(page.locator("#notifications-toggle")).toBeFocused();
  await page.locator("#notifications-toggle").click();
  // Axe uses timers internally; resume only after the deterministic toast checks.
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("private routes redirect and invalid login reveals no account details", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/admin/orders/108");
  await expect(page).toHaveURL(/\/admin\/$/);
  await page.getByLabel("E-mail", { exact: true }).fill("missing@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("wrong-synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Credenciais inválidas.");
});
test("owner logs in and sees dashboard cards chart and new paid badge", async ({ page }) => {
  await mockAdmin(page);
  await login(page);
  await expect(page.getByText("Receita bruta hoje", { exact: true })).toBeVisible();
  await expect(page.getByText("Novo pedido pago", { exact: true })).toBeVisible();
  await expect(page.locator(".chart-point")).toHaveCount(2);
  await page.locator(".chart-point").last().focus();
  await expect(page.locator(".chart-point").last().locator("span")).toBeVisible();
});
test("orders filters details and status progression retain fulfillment", async ({ page }) => {
  const calls = await mockAdmin(page);
  await login(page);
  await navigate(page, "Pedidos");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("Received");
  await page.getByLabel("Buscar pedido ou cliente").fill("Cliente");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect.poll(() => calls.some((c) => c.path.includes("status=Received"))).toBe(true);
  await page.getByRole("link", { name: "#108", exact: true }).click();
  await expect(page.getByText(/Rua Teste, 10/)).toBeVisible();
  await page.getByRole("button", { name: "Iniciar preparo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Marcar como pronto", exact: true })).toBeVisible();
  expect(calls.some((c) => c.method === "PATCH" && c.body.status === "Preparing")).toBe(true);
});
test("finance period updates real response totals and has accessible chart", async ({ page }) => {
  await mockAdmin(page);
  await login(page);
  await navigate(page, "Financeiro");
  await page.getByRole("combobox", { name: "Período", exact: true }).selectOption("30d");
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
  await expect(page.locator("#finance-results .card").first()).toContainText("300,00");
  await expect(page.locator("#finance-results")).toContainText("Estornos observados");
  await expect(page.locator("#finance-results")).toContainText("Receita líquida no período");
  await expect(page.getByText("Baseado em", { exact: false })).toBeVisible();
});
test("products allow controlled edits and store remains read-only", async ({ page }) => {
  const calls = await mockAdmin(page);
  await login(page);
  await navigate(page, "Produtos");
  await page.locator('[data-product="1"]').getByLabel("Custo por unidade").fill("12.50");
  await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (c) => c.method === "PATCH" && c.path === "products/1" && c.body.costPrice === 12.5,
      ),
    )
    .toBe(true);
  await navigate(page, "Loja");
  await expect(page.getByText("18h às 23h", { exact: true })).toBeVisible();
  await expect(page.getByText("somente leitura", { exact: false })).toBeVisible();
});
test("owner changes password and is required to sign in again", async ({ page }) => {
  const calls = await mockAdmin(page);

  await login(page);
  await navigate(page, "Segurança");

  await expect(page.getByRole("heading", { name: "Segurança", exact: true })).toBeVisible();

  await page.getByLabel("Senha atual", { exact: true }).fill("synthetic-test-password");
  await page.getByLabel("Nova senha", { exact: true }).fill("New-synthetic-password-123!");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("New-synthetic-password-123!");

  await page.getByRole("button", { name: /Alterar senha/ }).click();

  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await expect(page.locator("#admin-message")).toContainText("Senha alterada. Entre novamente.");

  expect(
    calls.some(
      (call) =>
        call.path === "auth/change-password" &&
        call.method === "POST" &&
        call.body.currentPassword === "synthetic-test-password" &&
        call.body.newPassword === "New-synthetic-password-123!",
    ),
  ).toBe(true);
});
test("logout removes protected screen and subsequent access requires login", async ({ page }) => {
  await mockAdmin(page);
  await login(page);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/$/);
  await page.goto("/admin/finance");
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
});
test("login and dashboard are accessible and have no page-wide mobile overflow", async ({
  page,
}, testInfo) => {
  await mockAdmin(page);
  await page.goto("/admin/");
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await login(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
});
test("public storefront never links to owner administration", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await expect(page.locator("#cart-btn")).toBeAttached();
});
