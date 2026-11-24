import { expect, test } from "@playwright/test";

for (const width of [320, 393, 768, 1440, 1920]) {
  for (const language of ["Português", "English"]) {
    test(`Home keeps full copy and navigation at ${width}px in ${language}`, async ({ page, request }) => {
      const identity = await request.get("/api/homologation/info");
      expect(identity.status()).toBe(200);
      expect(await identity.json()).toMatchObject({ environment: "Homologation", isolated: true, sandbox: true });
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: language, exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      const heading = page.getByRole("heading", { level: 1 });
      const ending = await heading.locator("span").last().boundingBox();
      const intro = await page.locator("h1 + p").boundingBox();
      expect(ending).not.toBeNull();
      expect(intro).not.toBeNull();
      // Page scrollWidth alone misses content clipped by an overflow-hidden ancestor.
      for (const box of [ending!, intro!]) {
        expect(box.x).toBeGreaterThanOrEqual(15);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.getByRole("link", { name: language === "English" ? "See full menu →" : "Ver cardápio →", exact: true }).click();
      await expect(page).toHaveURL(/\/menu$/);
      await expect(page.getByRole("button", { name: /(?:Adicionar ao carrinho|Add to cart): The Classic/, exact: true })).toBeEnabled();
    });
  }
}
