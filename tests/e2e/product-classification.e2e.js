import { expect, test } from "@playwright/test";
import { mockAdmin, login, navigate } from "./admin-helpers.js";

test("public catalog moves original products, sorts and preserves translated cards", async ({
  page,
}) => {
  await page.route("**/api/products", (route) =>
    route.fulfill({
      json: [
        {
          code: "burger-praiano",
          name: "Praiano movido",
          description: "Descrição",
          price: 43.9,
          isActive: true,
          category: "drinks",
          displayOrder: 2,
          englishName: "Moved burger",
          englishDescription: "Description",
        },
        {
          code: "new-drink",
          name: "Bebida nova",
          description: "Descrição",
          price: 12,
          isActive: true,
          category: "drinks",
          displayOrder: 0,
          englishName: "New drink",
          englishDescription: "Description",
        },
        {
          code: "hidden-drink",
          name: "Desativado",
          description: "Descrição",
          price: 12,
          isActive: false,
          category: "drinks",
          displayOrder: 1,
        },
      ],
    }),
  );
  await page.goto("/");
  await expect(page.locator("#drinks .product-item-name")).toHaveText([
    "Bebida nova",
    "Praiano movido",
  ]);
  await expect(page.locator('#menu [data-id="burger-praiano"]')).toHaveCount(0);
  await expect(page.locator("#drinks article").nth(1).locator("img")).toHaveAttribute(
    "src",
    /praiano-burguer/,
  );
  await expect(page.locator("#drinks article").first().locator("img")).toHaveAttribute(
    "src",
    /logo-burger/,
  );
  await page.locator("#language-select").selectOption("en-US");
  await expect(page.locator("#drinks .product-item-name")).toHaveText([
    "New drink",
    "Moved burger",
  ]);
  await expect(page.locator('[data-id="hidden-drink"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("admin saves classification and keeps translation and availability controls", async ({
  page,
}) => {
  const calls = await mockAdmin(page);
  await login(page);
  await navigate(page, "Produtos");
  const form = page.locator('[data-product="1"]');
  await form.locator('[name="description"]').fill("Descrição de teste");
  await form.getByRole("combobox", { name: "Categoria", exact: true }).selectOption("sides");
  await form.getByLabel(/Ordem de exibição/).fill("0");
  await expect(form.locator("[data-translate-product]")).toBeVisible();
  await expect(form.locator("[data-toggle-product]")).toBeVisible();
  await form.getByRole("button", { name: /Salvar produto/ }).click();
  await expect(page.locator("#admin-message")).toContainText("Produto atualizado");
  expect(
    calls.find((call) => call.path === "products/1" && call.method === "PATCH").body,
  ).toMatchObject({ category: "sides", displayOrder: 0, isActive: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
