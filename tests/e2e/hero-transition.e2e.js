import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("opens on the completely new product-first hero", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".night-hero");
  await expect(hero).toBeVisible();
  await expect(hero.locator(".burger-stage__item")).toHaveCount(3);
  await expect(hero.locator(".button--acid")).toHaveAttribute("href", "./menu.html");
  await expect(page.locator(".campaign-hero, .featured-burgers, .bh-pretty-nav")).toHaveCount(0);
});

test("keeps the hero inside a small mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator("#night-hero-title")).toBeVisible();
  await expect(page.locator(".button--acid")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test("translates the new landing in place", async ({ page }) => {
  await page.goto("/");
  await page.locator("#language-select").selectOption("en-US");
  await expect(page.locator("#night-hero-title")).toHaveText("Hunger won't wait.");
  await expect(page.locator("#launches-title")).toHaveText("Three new reasons to come back.");
  await expect(page.locator(".header-order")).toHaveText("Order now");
  await page.locator("#language-select").selectOption("pt-BR");
  await expect(page.locator("#night-hero-title")).toHaveText("Fome não espera.");
});

test("keeps the landing accessible", async ({ page }) => {
  await page.goto("/");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
});
