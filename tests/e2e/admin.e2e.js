import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAdmin, login, navigate } from "./admin-helpers.js";

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
  await page.getByLabel("Custo por unidade").fill("12.50");
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
