import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAdmin, login } from "./admin-helpers.js";
import { mockData } from "../admin-fixtures.js";

test("owner visual review on standard desktop, large desktop and mobile", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const sizes =
    testInfo.project.name === "chromium"
      ? [
          { name: "desktop", width: 1100, height: 1000 },
          { name: "large-desktop", width: 1440, height: 1000 },
        ]
      : [{ name: "mobile", width: 390, height: 844 }];
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      isMobile: size.name === "mobile",
      hasTouch: size.name === "mobile",
      baseURL: "http://127.0.0.1:4173",
    });
    const page = await context.newPage();
    await mockAdmin(page);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const capture = async (name) => {
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText("Carregando…", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations).toEqual([]);
      const path = testInfo.outputPath(`${size.name}-${name}.png`);
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      await testInfo.attach(`${size.name}-${name}`, { path, contentType: "image/png" });
    };
    await page.goto("/admin/");
    await capture("login");
    await login(page);
    await expect(page.locator(".chart-point")).toHaveCount(2);
    await capture("dashboard");
    const positions = await page.locator("#dashboard-cards .card").evaluateAll((cards) =>
      cards.map((card) => ({
        x: card.getBoundingClientRect().x,
        y: card.getBoundingClientRect().y,
      })),
    );
    if (size.name !== "mobile") {
      expect(new Set(positions.slice(0, 4).map((p) => p.y)).size).toBe(1);
      expect(new Set(positions.slice(4).map((p) => p.y)).size).toBe(1);
      expect(positions[4].y).toBeGreaterThan(positions[0].y);
    } else expect(new Set(positions.map((p) => p.x)).size).toBe(1);
    for (const [route, name] of [
      ["orders", "orders"],
      ["orders/108", "order-108"],
      ["finance", "finance"],
      ["products", "products"],
      ["store", "store"],
    ]) {
      await page.goto("/admin/" + route);
      if (name === "orders")
        await expect(page.getByRole("link", { name: "#108", exact: true })).toBeVisible();
      if (name === "finance")
        await expect(page.locator("#finance-results .chart-point")).toHaveCount(2);
      await capture(name);
    }
    // API fixtures below are exclusively for visual review of the approved zero-sales state.
    await page.route("**/api/admin/dashboard", async (route) => {
      const data = mockData("dashboard");
      const empty = {
        ...data.today,
        grossRevenue: 0,
        refundedAmount: 0,
        netRevenue: 0,
        paidOrders: 0,
        averageTicket: 0,
        grossProfit: null,
        ordersWithCost: 0,
        partialRefunds: 0,
      };
      for (const key of ["today", "week", "month", "last30Days"]) data[key] = empty;
      data.recentOrders = Array.from({ length: 8 }, (_, i) => ({
        ...data.recentOrders[0],
        id: 108 - i,
        customerName: "Cliente Teste",
        status: i === 0 ? "Received" : "Preparing",
      }));
      await route.fulfill({ json: data });
    });
    await page.route("**/api/admin/finance/revenue?*", (route) =>
      route.fulfill({
        json: Array.from({ length: 7 }, (_, i) => ({
          date: `2026-10-${String(i + 1).padStart(2, "0")}`,
          revenue: 0,
        })),
      }),
    );
    await page.goto("/admin/dashboard");
    await expect(page.locator(".chart-point")).toHaveCount(7);
    await expect(
      page.getByText("Nenhuma venda aprovada neste período.", { exact: true }),
    ).toBeVisible();
    await capture("dashboard-zero");
    await page.locator(".info-trigger").focus();
    await expect(page.locator(".tooltip")).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  }
});
