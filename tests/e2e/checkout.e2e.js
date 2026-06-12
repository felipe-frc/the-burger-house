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

test("deve exibir aviso para CEP inválido", async ({ page }) => {
  await page.route("**/ws/00000000/json/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ erro: true }),
    });
  });

  await page.goto("/");

  await addFirstProductToCart(page);
  await openCart(page);
  await page.locator("#go-to-address-btn").click();
  await page.locator("#cep").fill("00000000");

  await expect(page.locator("#address-warn")).toContainText(/CEP n.o encontrado/i);
  await expect(page.locator("#street")).toHaveValue("");
});

test("deve manter o fluxo bloqueado quando o carrinho ficar vazio antes da revisão", async ({
  page,
}) => {
  await page.goto("/");

  await addFirstProductToCart(page);
  await openCart(page);

  await page.locator(".remove-btn").click();

  await expect(page.locator("#cart-items")).toContainText(/carrinho est. vazio/i);
  await expect(page.locator("#go-to-address-btn")).toBeDisabled();
});

test("deve trocar o idioma da interface e refletir os textos do pedido", async ({
  page,
}) => {
  await page.goto("/");

  await page.locator("#language-select").selectOption("en-US");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#category-nav")).toContainText("Burgers");

  await addFirstProductToCart(page);
  await openCart(page);

  await expect(page.locator("#cart-items")).toContainText("The Beach Burger");
});

test("deve enviar observações longas no pedido final", async ({ page }) => {
  const longNotes =
    "Sem cebola, sem picles, carne ao ponto, molho separado, enviar ketchup extra e guardanapos adicionais por favor.";

  await page.goto("/");

  await addFirstProductToCart(page);
  await openCart(page);
  await page.locator("#go-to-address-btn").click();
  await page.locator("#cep").fill("38400000");
  await page.locator("#house-number").fill("123");
  await page.locator("#go-to-review-btn").click();
  await page.locator("#order-notes").fill(longNotes);
  await page.locator("#finish-order-btn").click();

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__openedUrls?.[0] || "");
    })
    .not.toBe("");

  const whatsappUrl = await page.evaluate(() => window.__openedUrls[0]);
  const decodedUrl = decodeURIComponent(whatsappUrl);

  expect(decodedUrl).toContain(longNotes);
});

test("deve permitir remover item antes da revisão e seguir com o item restante", async ({
  page,
}) => {
  await page.goto("/");

  const addButtons = page.locator(".add-to-cart-btn");

  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await expect(page.locator("#cart-count")).toHaveText("2");

  await openCart(page);
  await expect(page.locator("#cart-items")).toContainText("O Praiano");
  await expect(page.locator("#cart-items")).toContainText("O Famoso Onion Ring");

  await page.locator(".remove-btn").nth(0).click();

  await expect(page.locator("#cart-items")).not.toContainText("O Praiano");
  await expect(page.locator("#cart-items")).toContainText("O Famoso Onion Ring");

  await page.locator("#go-to-address-btn").click();
  await page.locator("#cep").fill("38400000");
  await page.locator("#house-number").fill("123");
  await page.locator("#go-to-review-btn").click();

  await expect(page.locator("#review-items")).not.toContainText("O Praiano");
  await expect(page.locator("#review-items")).toContainText("O Famoso Onion Ring");
});
