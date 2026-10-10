import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("privacy policy is published, linked and accessible on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Política de Privacidade", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Política de Privacidade");
  await expect(page.getByRole("heading", { name: "Retenção" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Direitos do titular" })).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
