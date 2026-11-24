import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("menu categories remain accessible, translatable and responsive", async ({ page }) => {
  await page.goto("/menu.html");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("LOCAL");

  const drinks = page.getByRole("button", { name: "BEBIDAS" });
  await drinks.click();
  await expect(drinks).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/category=drinks/);
  await expect(page.locator('[data-menu-category="drinks"]:visible')).toHaveCount(6);

  for (const image of await page.locator('[data-menu-category="drinks"] img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 1)).toBe(
      true,
    );
  }

  await page.locator("#language-select").selectOption("en-US");
  await expect(page.getByRole("button", { name: "DRINKS" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-i18n="menu.footerTagline"]')).toHaveCSS(
    "color",
    "rgb(23, 23, 23)",
  );

  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
