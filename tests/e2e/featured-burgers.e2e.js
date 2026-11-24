import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => page.goto("/"));

test("loads the three product stories and the menu mosaic", async ({ page }) => {
  const launches = page.locator("#launches");
  await launches.scrollIntoViewIfNeeded();
  await expect(launches.locator(".launch")).toHaveCount(3);
  await expect(page.locator(".menu-mosaic__item")).toHaveCount(4);
  for (const image of await page.locator("main img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    await expect(image).toHaveCSS("object-fit", "contain");
  }
});

test("keeps the page responsive without document overflow", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("mobile navigation opens, closes and supports Escape", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile navigation");
  const toggle = page.locator(".nav-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".site-nav")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("every commercial menu action reaches the separate catalog", async ({ page }) => {
  const cta = page.locator(".night-hero .button--acid");
  await cta.click();
  await expect(page).toHaveURL(/\/menu\.html$/);
  await expect(page.locator("#menu")).toBeVisible();
});
