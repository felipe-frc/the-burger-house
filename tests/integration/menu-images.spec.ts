import { readFileSync } from "node:fs";
import { test, expect } from "../e2e/owner-react-fixture.js";

const catalog = JSON.parse(readFileSync(new URL("../../scripts/admin/demo-catalog.json", import.meta.url), "utf8"));

for (const width of [1440, 1366, 1024, 768, 430, 375, 320]) {
  test(`all fifteen menu images stay contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/products", route => route.fulfill({
      json: catalog.products.map((product: object) => ({ ...product, isActive: true })),
    }));
    await page.goto("/menu");
    await page.getByRole("button", { name: /^Ver cardápio completo$/i }).click();
    const menu = page.getByRole("dialog", { name: /Escolha seu favorito/i });
    for (const [category, count] of [["SMASH BURGERS", 6], ["ACOMPANHAMENTOS", 3], ["BEBIDAS", 6]] as const) {
      await menu.getByRole("tab", { name: new RegExp(category) }).click();
      const cards = menu.getByRole("tabpanel").locator("article");
      await expect(cards).toHaveCount(count);
      for (const card of await cards.all()) {
        const image = card.locator(".tbh-fullmenu-product-image");
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
        const geometry = await card.evaluate(element => {
          const image = element.querySelector<HTMLImageElement>(".tbh-fullmenu-product-image")!;
          const frame = element.querySelector<HTMLElement>(".tbh-fullmenu-image-trigger")!;
          const copy = element.querySelector<HTMLElement>(".tbh-fullmenu-product-copy")!;
          const imageBox = image.getBoundingClientRect();
          const frameBox = frame.getBoundingClientRect();
          const cardBox = element.getBoundingClientRect();
          const styles = getComputedStyle(image);
          return {
            contained: imageBox.left >= frameBox.left - 1 && imageBox.right <= frameBox.right + 1 &&
              imageBox.top >= frameBox.top - 1 && imageBox.bottom <= frameBox.bottom + 1 &&
              frameBox.top >= cardBox.top && frameBox.bottom <= cardBox.bottom,
            separate: frameBox.right <= copy.getBoundingClientRect().left,
            background: getComputedStyle(frame).backgroundColor,
            objectFit: styles.objectFit,
          };
        });
        expect(geometry).toEqual({ contained: true, separate: true, background: "rgba(0, 0, 0, 0)", objectFit: "contain" });
        await expect(card.getByRole("button", { name: /^Adicionar /i })).toBeEnabled();
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
