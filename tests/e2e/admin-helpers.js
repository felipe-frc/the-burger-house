import { expect } from "@playwright/test";
import { mockData } from "../admin-fixtures.js";
export async function mockAdmin(page) {
  let signed = false,
    status = "Received";
  const calls = [];
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace("/api/admin/", "") + url.search;
    calls.push({ path, method: request.method(), body: request.postDataJSON() });
    if (path === "auth/login" && request.method() === "GET")
      return route.fulfill({ json: { csrfToken: "test-only" } });
    if (path === "auth/login") {
      if (request.postDataJSON().password !== "synthetic-test-password")
        return route.fulfill({ status: 401, json: { error: "Credenciais inválidas." } });
      signed = true;
      return route.fulfill({ json: { role: "Owner" } });
    }
    if (!signed) return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    if (path === "auth/me")
      return route.fulfill({ json: { role: "Owner", csrfToken: "test-only" } });
    if (path === "auth/logout") {
      signed = false;
      return route.fulfill({ status: 204 });
    }
    if (request.method() === "PATCH") {
      if (path.endsWith("/status")) status = request.postDataJSON().status;
      return route.fulfill({ status: 204 });
    }
    const data = mockData(path);
    if (path === "orders/108") data.order.status = status;
    if (path.startsWith("finance/summary") && path.includes("period=30d")) data.revenue = 300;
    return route.fulfill({ json: data });
  });
  return calls;
}
export async function login(page) {
  await page.goto("/admin/");
  await page.getByLabel("E-mail", { exact: true }).fill("owner@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}
export async function navigate(page, name) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation").getByRole("link", { name, exact: false }).click();
}
