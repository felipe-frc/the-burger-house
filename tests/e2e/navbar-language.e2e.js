import { expect, test } from "@playwright/test";

test("language preference survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("#language-select").selectOption("en-US");
  await page.reload();
  await expect(page.locator("#language-select")).toHaveValue("en-US");
  await expect(page.locator(".site-nav a").first()).toHaveText("New burgers");
  await expect(page.locator(".site-nav")).toHaveAttribute("aria-label", "Main navigation");
});
