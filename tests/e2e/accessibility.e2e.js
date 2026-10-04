import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fixedDate = new Date("2026-01-01T20:00:00");

    class MockDate extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedDate);
          return;
        }

        super(...args);
      }

      static now() {
        return fixedDate.getTime();
      }
    }

    window.Date = MockDate;
  });
});

async function addFirstProductToCart(page) {
  const firstProductButton = page.locator(".add-to-cart-btn").first();

  await expect(firstProductButton).toBeVisible();
  await firstProductButton.scrollIntoViewIfNeeded();
  await firstProductButton.click();

  await expect(page.locator("#cart-count")).toHaveText("1");
}

async function openCart(page) {
  await page.evaluate(() => {
    document.querySelector("#cart-btn")?.click();
  });

  await expect(page.locator("#cart-modal")).toBeVisible();
}

async function openAddressModal(page) {
  await page.locator("#go-to-address-btn").click();

  await expect(page.locator("#address-modal")).toBeVisible();
}

async function openReviewModal(page) {
  await page.locator("#customer-name").fill("Cliente Teste");
  await page.locator("#customer-phone").fill("11999990000");
  await page.evaluate(() => {
    const pickupInput = document.querySelector("#order-type-pickup");

    if (!(pickupInput instanceof HTMLInputElement)) {
      throw new Error("Campo de retirada no local não encontrado.");
    }

    pickupInput.checked = true;
    pickupInput.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.locator("#pickup-info")).toBeVisible();

  await page.locator("#go-to-review-btn").click();

  await expect(page.locator("#review-modal")).toBeVisible();
}

test("deve não apresentar violações automáticas de acessibilidade na página inicial", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /The Burger House/i })).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("deve não apresentar violações automáticas de acessibilidade no carrinho", async ({
  page,
}) => {
  await page.goto("/");

  await addFirstProductToCart(page);
  await openCart(page);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("#cart-modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("deve não apresentar violações automáticas de acessibilidade no formulário de endereço", async ({
  page,
}) => {
  await page.goto("/");

  await addFirstProductToCart(page);
  await openCart(page);
  await openAddressModal(page);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("#address-modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("deve não apresentar violações automáticas de acessibilidade na revisão do pedido", async ({
  page,
}) => {
  await page.goto("/");

  await addFirstProductToCart(page);
  await openCart(page);
  await openAddressModal(page);
  await openReviewModal(page);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("#review-modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
