import { test, expect } from "@playwright/test";

test("navbar traduz PT EN PT e atualiza acessibilidade", async ({ page }) => {
  await page.goto("/");

  const nav = page.locator(".bh-pretty-nav");
  await expect(nav).toBeVisible();

  const links = nav.locator(".bh-pretty-nav-links a");
  const delivery = nav.locator("[data-pretty-delivery]");
  const cart = nav.locator("[data-pretty-cart]");

  await nav.locator('[data-lang="en-US"]').click();

  await expect(links.nth(0)).toHaveText("ABOUT");
  await expect(links.nth(1)).toHaveText("MENU");
  await expect(links.nth(2)).toHaveText("CONTACT");
  await expect(delivery).toHaveText("ORDER DELIVERY");
  await expect(nav).toHaveAttribute("aria-label", "Main navigation");
  await expect(cart).toHaveAttribute("aria-label", /Open my cart/);

  await nav.locator('[data-lang="pt-BR"]').click();

  await expect(links.nth(0)).toHaveText("SOBRE");
  await expect(links.nth(1)).toHaveText("CARDÁPIO");
  await expect(links.nth(2)).toHaveText("CONTATO");
  await expect(delivery).toHaveText("PEDIR DELIVERY");
  await expect(nav).toHaveAttribute("aria-label", "Navegação principal");
  await expect(cart).toHaveAttribute("aria-label", /Abrir meu carrinho/);
});

test("navbar abre no idioma salvo", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("burgerShop:language", "en-US");
  });

  await page.goto("/");
  const nav = page.locator(".bh-pretty-nav");

  await expect(nav).toBeVisible();
  await expect(
    nav.locator(".bh-pretty-nav-links a").first()
  ).toHaveText("ABOUT");
  await expect(
    nav.locator("[data-pretty-delivery]")
  ).toHaveText("ORDER DELIVERY");
  await expect(nav).toHaveAttribute("aria-label", "Main navigation");
});
