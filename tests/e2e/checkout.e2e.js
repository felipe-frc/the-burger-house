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

    window.__openedUrls = [];
    window.open = (url) => {
      window.__openedUrls.push(String(url));
      return null;
    };
  });

  await page.route("**/ws/38400000/json/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cep: "38400-000",
        logradouro: "Rua dos Testes",
        bairro: "Centro",
        localidade: "Uberlândia",
        uf: "MG",
      }),
    });
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

test("deve simular o fluxo completo de compra com entrega", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /The Burger House/i })
  ).toBeVisible();

  await addFirstProductToCart(page);
  await openCart(page);

  await expect(page.locator("#cart-items")).toContainText("O Praiano");

  await page.locator("#go-to-address-btn").click();

  await expect(page.locator("#address-modal")).toBeVisible();

  await page.locator("#cep").fill("38400000");

  await expect(page.locator("#street")).toHaveValue("Rua dos Testes");
  await expect(page.locator("#neighborhood")).toHaveValue("Centro");
  await expect(page.locator("#city")).toHaveValue("Uberlândia");

  await page.locator("#house-number").fill("123");
  await page.locator("#complement").fill("Apto 101");

  await page.locator("#go-to-review-btn").click();

  await expect(page.locator("#review-modal")).toBeVisible();
  await expect(page.locator("#review-items")).toContainText("O Praiano");
  await expect(page.locator("#review-address")).toContainText("Rua dos Testes");
  await expect(page.locator("#review-address")).toContainText("123");
  await expect(page.locator("#review-total")).toContainText("R$");

  await page.locator("#order-notes").fill("Sem cebola.");

  await page.locator("#finish-order-btn").click();

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__openedUrls?.[0] || "");
    })
    .not.toBe("");

  const whatsappUrl = await page.evaluate(() => window.__openedUrls[0]);
  const decodedUrl = decodeURIComponent(whatsappUrl);

  expect(whatsappUrl).toMatch(/whatsapp|wa\.me/i);
  expect(decodedUrl).toContain("O Praiano");
  expect(decodedUrl).toContain("Rua dos Testes");
  expect(decodedUrl).toContain("Sem cebola");
});

test("deve permitir retirada no local sem preencher endereço", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /The Burger House/i })
  ).toBeVisible();

  await addFirstProductToCart(page);
  await openCart(page);

  await page.locator("#go-to-address-btn").click();

  await expect(page.locator("#address-modal")).toBeVisible();

  await page.evaluate(() => {
  const pickupInput = document.querySelector("#order-type-pickup");

  if (!pickupInput) {
    throw new Error("Campo de retirada no local não encontrado.");
  }

  pickupInput.checked = true;
  pickupInput.dispatchEvent(new Event("change", { bubbles: true }));
});

  await expect(page.locator("#pickup-info")).toBeVisible();
  await expect(page.locator("#delivery-fields")).toBeHidden();

  await page.locator("#go-to-review-btn").click();

  await expect(page.locator("#review-modal")).toBeVisible();
  await expect(page.locator("#review-address")).toContainText(/retirada/i);
  await expect(page.locator("#review-total")).toContainText("R$");
});