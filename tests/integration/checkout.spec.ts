import type { Page } from "@playwright/test";
import { test, expect } from "../e2e/owner-react-fixture.js";

// Exercise the built React storefront with local fixtures for every API and provider call.
const product = {
  code: "burger-praiano",
  name: "O Praiano",
  description: "Receita oficial",
  price: 43.9,
  isActive: true,
  category: "menu",
  displayOrder: 1,
};
const cartKey = "burger-house-drawer-cart-v1";
const paymentUrl = "https://pagamento.sandbox.pagbank.com.br/checkout/LOCAL_TEST";

test('local sandbox keeps store tab, resumes same order and trusts server status only', async ({ page, context }) => {
  let orders = 0, approved = false;
  await page.route('**/api/orders', route => {
    orders++;
    return route.fulfill({ status: 201, json: { orderId: 99, orderAccessToken: "synthetic-order-proof-not-a-real-token", subtotal: 43.9, deliveryFee: 0, total: 43.9 } });
  });
  await page.route('**/api/checkout/99', route => route.fulfill({ json: { paymentId: 17, checkoutUrl: paymentUrl, keepStoreOpen: true } }));
  await page.route('**/api/payments/17', route => route.fulfill({ json: { paymentId: 17, orderId: 99, amount: 43.9, status: approved ? 'Approved' : 'Pending', method: 'Pix' } }));
  await context.route(paymentUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>Provedor sandbox controlado</h1>' }));
  await review(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^Ir para pagamento$/i }).click();
  const popup = await popupPromise;
  await popup.waitForURL(paymentUrl);
  expect(page.url()).toContain('/menu');
  await expect(page.getByRole('heading', { name: /^Pagamento pendente$/i })).toBeVisible();
  await popup.close();
  approved = true;
  await page.bringToFront();
  await page.getByRole('button', { name: /Consultar pagamento/i }).click();
  await expect(page.getByText(/Pagamento aprovado/i).first()).toBeVisible();
  expect(orders).toBe(1);
});
async function activeCart(page: Page): Promise<{ id: string; quantity: number }[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('burger-house-basket-v2:' + sessionStorage.getItem('burger-house-active-basket-v2')) ?? '{"items":[]}').items);
}
test.beforeEach(async ({ context, page, ownerOrigin }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ownerOrigin && !url.pathname.startsWith("/api/") &&
      ["GET", "HEAD"].includes(route.request().method())) return route.continue();
    return route.abort();
  });
  await context.route("**/api/products", (route) => route.fulfill({ json: [product] }));
  await context.route("**/api/products/extras", route => route.fulfill({ json: [] }));
});

async function openMenu(page: Page, english = false) {
  await page.getByRole("button", { name: english ? /^View full menu$/i : /^Ver cardápio completo$/i }).click();
}

async function addPraiano(page: Page) {
  await openMenu(page);
  await page.getByRole("dialog", { name: /^Escolha seu favorito\.$/i })
    .getByRole("button", { name: /^Adicionar O Praiano$/i }).click();
  await page.getByRole("button", { name: /^Ver sacola$/i }).click();
  await expect(page.getByRole("heading", { name: /^Sua sacola$/i })).toBeVisible();
}

async function review(page: Page, delivery = false) {
  await page.goto("/menu?forceOpen=true");
  await addPraiano(page);
  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.getByRole("radio", { name: delivery ? /^Entrega$/i : /^Retirada no local$/i }).check();
  await page.getByLabel(/^Nome completo\s*\*?$/i).fill("Cliente Teste");
  await page.getByLabel("Celular com DDD").fill("11999990000");
  await page.getByRole("textbox", { name: /^E-mail$/i }).fill("cliente@example.com");
  await page.getByLabel(/^CPF\s*\*?$/i).fill("52998224725");
  if (delivery) {
    await page.route("https://viacep.com.br/**", (route) =>
      route.fulfill({
        json: {
          cep: "38400-000",
          logradouro: "Rua Teste",
          bairro: "Centro",
          localidade: "Uberlândia",
        },
      }),
    );
    await page.getByLabel(/^CEP\s*\*?$/i).fill("38400000");
    await page.getByRole("button", { name: /^Buscar CEP$/i }).click();
    await expect(page.getByLabel(/^Rua\s*\*?$/i)).toHaveValue("Rua Teste");
    await page.getByLabel(/^Número\s*\*?$/i).fill("10");
  }
  await expect(page.getByRole("link", { name: /^Política de Privacidade \(nova aba\)$/i })).toHaveAttribute(
    "href",
    "/privacy.html",
  );
  await page.getByRole("button", { name: /^Revisar pedido$/i }).click();
  await expect(page.getByRole("heading", { name: /^Revise seu pedido$/i })).toBeVisible();
  await expect(page.locator('input[type="checkbox"][required]')).toHaveCount(0);
}

for (const delivery of [false, true]) {
  test(`catalog → cart → ${delivery ? "delivery" : "pickup"} → PagBank → server-approved payment`, async ({
    page, ownerOrigin,
  }) => {
    const total = 43.9 + (delivery ? 5 : 0);
    let orders = 0;
    await page.route("**/api/orders", async (route) => {
      orders++;
      const payload = route.request().postDataJSON();
      expect(payload.items).toEqual([
        { productCode: product.code, quantity: 1, observation: null },
      ]);
      expect(payload).not.toHaveProperty("total");
      expect(payload.items[0]).not.toHaveProperty("price");
      expect(payload.orderType).toBe(delivery ? "delivery" : "pickup");
      expect(payload.street).toBe(delivery ? "Rua Teste" : null);
      await route.fulfill({
        status: 201,
        json: { orderId: 99, orderAccessToken: "synthetic-order-proof-not-a-real-token", subtotal: 43.9, deliveryFee: delivery ? 5 : 0, total },
      });
    });
    await page.route("**/api/checkout/99", (route) =>
      route.fulfill({ json: { paymentId: 17, checkoutUrl: paymentUrl } }),
    );
    await page.route(paymentUrl, (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<a href="${ownerOrigin}/menu?status=approved">Voltar à loja</a>`,
      }),
    );
    let status = 1;
    await page.route("**/api/payments/17", (route) =>
      route.fulfill({ json: { paymentId: 17, orderId: 99, amount: total, status } }),
    );
    await review(page, delivery);
    await page.getByRole("button", { name: /^Ir para pagamento$/i }).click();
    await expect(page).toHaveURL(paymentUrl);
    await page.getByRole("link", { name: /^Voltar à loja$/i }).click();
    await expect(page.getByRole("heading", { name: /^Pagamento pendente$/i })).toBeVisible();
    expect(orders).toBe(1);
    status = 2;
    await page.getByRole("button", { name: /^Consultar pagamento$/i }).click();
    await expect(page.getByRole("heading", { name: /^Pagamento aprovado$/i })).toBeVisible();
    await page.getByRole("button", { name: /^Fazer novo pedido$/i }).click();
    await expect.poll(() => activeCart(page)).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem("burger-house-last-receipt-v2"))).toBeNull();
    await page.screenshot({
      path: test.info().outputPath("checkout-completed.png"),
      fullPage: true,
    });
  });
}

test("revalidates changed prices before creating an order", async ({ page }) => {
  let orders = 0;
  await page.route("**/api/orders", (route) => {
    orders++;
    return route.fulfill({ status: 500 });
  });
  await review(page);
  await page.route("**/api/products", (route) =>
    route.fulfill({ json: [{ ...product, price: 49.9 }] }),
  );
  await page.getByRole("button", { name: /^Ir para pagamento$/i }).click();
  await expect(page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("alert")).toContainText("Os preços ou a disponibilidade mudaram");
  expect(orders).toBe(0);
});

test("retries hosted checkout without duplicating the order", async ({ page }) => {
  let orders = 0;
  await page.route("**/api/orders", (route) => {
    orders++;
    return route.fulfill({
      status: 201,
      json: { orderId: 99, orderAccessToken: "synthetic-order-proof-not-a-real-token", subtotal: 43.9, deliveryFee: 0, total: 43.9 },
    });
  });
  await page.route("**/api/checkout/99", (route) =>
    route.fulfill({ status: 502, json: { error: "Could not prepare hosted checkout." } }),
  );
  await review(page);
  await page.getByRole("button", { name: /^Ir para pagamento$/i }).click();
  await expect(page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("alert")).toContainText("O pedido está salvo");
  const retry = page.waitForResponse("**/api/checkout/99");
  await page.getByRole("button", { name: /^Retomar pagamento$/i }).click();
  expect((await retry).status()).toBe(502);
  await expect(page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("alert")).toContainText("O pedido está salvo");
  expect(orders).toBe(1);
});

test("a cancelled order without a payment can be replaced without retrying it", async ({ page }) => {
  let orders = 0;
  await page.route("**/api/orders", (route) => route.fulfill({
    status: 201, json: { orderId: 99 + orders++, orderAccessToken: "synthetic-order-proof-not-a-real-token", subtotal: 43.9, deliveryFee: 0, total: 43.9 },
  }));
  await page.route("**/api/checkout/99", (route) => route.fulfill({ status: 502, json: {} }));
  await review(page);
  await page.getByRole("button", { name: /^Ir para pagamento$/i }).click();
  const resume = page.getByRole("button", { name: /^Retomar pagamento$/i });
  await expect(resume).toBeVisible();
  await page.route("**/api/checkout/99", (route) => route.fulfill({ status: 409, json: { code: "order_cancelled" } }));
  await resume.click();
  await expect(page.getByRole("heading", { name: /^Pedido cancelado$/i })).toBeVisible();
  await expect(resume).toHaveCount(0);
  await page.getByRole("button", { name: /^Fazer novo pedido$/i }).click();
  await expect(page.getByRole("dialog", { name: /Escolha seu favorito/i })).toBeVisible();
  expect(orders).toBe(1);
});

test("resumes a created order after a provider failure and page reload", async ({ page }) => {
  let orders = 0;
  await page.route("**/api/orders", (route) => {
    orders++;
    return route.fulfill({
      status: 201,
      json: { orderId: 99, orderAccessToken: "synthetic-order-proof-not-a-real-token", subtotal: 43.9, deliveryFee: 0, total: 43.9 },
    });
  });
  await page.route("**/api/checkout/99", (route) =>
    route.fulfill({ status: 502, json: { error: "Provider unavailable" } }),
  );
  await review(page);
  await page.getByRole("button", { name: /^Ir para pagamento$/i }).click();
  await expect(page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("alert")).toContainText("O pedido está salvo");
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Pedido #99$/i })).toBeVisible();
  await page.route("**/api/checkout/99", (route) =>
    route.fulfill({ json: { paymentId: 17, checkoutUrl: paymentUrl } }),
  );
  await page.route(paymentUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "Local provider fixture" }),
  );
  await page.getByRole("button", { name: /^Retomar pagamento$/i }).click();
  await expect(page).toHaveURL(paymentUrl);
  expect(orders).toBe(1);
});

for (const state of ["Rejected", "Cancelled", "NotFound", "MismatchedOrder"]) {
  test(`recovers ${state} safely without clearing the cart`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "burger-house-drawer-cart-v1",
        JSON.stringify([
          {
            id: "o-praiano",
            code: "burger-praiano",
            name: "O Praiano",
            price: 43.9,
            quantity: 1,
            available: true,
          },
        ]),
      );
      sessionStorage.setItem(
        "burger-house-payment-v1",
        JSON.stringify({
          version: 1,
          orderId: 99,
          orderAccessToken: "synthetic-order-proof-not-a-real-token",
          paymentId: 17,
          fulfillment: "pickup",
          subtotal: 43.9,
          deliveryFee: 0,
          total: 43.9,
          items: [{ code: "burger-praiano", name: "O Praiano", quantity: 1 }],
          createdAt: new Date().toISOString(),
        }),
      );
    });
    await page.route("**/api/payments/17", (route) =>
      route.fulfill(
        state === "NotFound"
          ? { status: 404, json: { error: "Payment was not found." } }
          : {
            json: {
              paymentId: 17,
              orderId: state === "MismatchedOrder" ? 100 : 99,
              amount: 43.9,
              status: state === "Cancelled" ? 4 : state === "Rejected" ? 3 : 2,
            },
          },
      ),
    );
    await page.goto("/menu?status=approved");
    if (state === "Rejected" || state === "Cancelled")
      await expect(
        page.getByRole("heading", {
          name: state === "Rejected" ? "Pagamento recusado" : "Pagamento cancelado ou expirado",
        }),
      ).toBeVisible();
    else
      await expect(page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("alert")).toContainText(
        state === "NotFound" ? "Não foi possível consultar o pagamento" : "não correspondem",
      );
    const cart = await activeCart(page);
    expect(cart).toHaveLength(1);
    await expect(page.getByRole("heading", { name: /^Pagamento aprovado$/i })).toHaveCount(0);
  });
}

test("unavailable catalog disables checkout and supports retry", async ({ page }) => {
  // Start a real active visit; a pre-seeded cart on a new navigation is intentionally discarded.
  await page.goto('/menu'); await addPraiano(page);
  await page.route("**/api/products", route => route.fulfill({ json: [] }));
  await page.reload();
  await page.getByRole("button", { name: /Ver sacola de pedidos, 1 itens/ }).click();
  await expect(page.getByText("Indisponível. Remova para continuar.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Continuar$/i })).toBeDisabled();

  await page.route("**/api/products", (route) => route.fulfill({ status: 503 }));
  await page.reload();
  await page.getByRole("button", { name: /Ver sacola de pedidos, 1 itens/ }).click();
  await expect(page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("alert")).toContainText("conferência do catálogo está indisponível");
  await expect(page.getByRole("button", { name: /^Continuar$/i })).toBeDisabled();

  await page.route("**/api/products", (route) => route.fulfill({ json: [product] }));
  await page.route("**/api/products/extras", route => route.fulfill({ json: [] }));
  await page.getByRole("dialog", { name: /^Seu (pedido|pagamento)$/i }).getByRole("button", { name: /^Tentar novamente$/i }).click();
  await expect(page.getByRole("button", { name: /^Continuar$/i })).toBeEnabled();
});

test("uses live prices across showcase, menu, details and bag, and blocks inactive products", async ({ page }) => {
  await page.route("**/api/products", route => route.fulfill({
    json: [
      { ...product, price: 51.9 },
      { ...product, code: "burger-crispy-chicken-cheddar", name: "Crispy Cheddar", isActive: false },
    ]
  }));
  await page.goto("/");
  const showcase = page.locator('[data-product="o-praiano"]');
  await expect(showcase.locator(".tbh-showcase-price")).toHaveText(/R\$\s*51,90/);
  await expect(page.locator('[data-product="crispy-cheddar"]').getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  await openMenu(page);
  const menu = page.getByRole("dialog", { name: /^Escolha seu favorito\.$/i });
  const card = menu.locator('[data-menu-product="o-praiano"]');
  await expect(card.locator(".tbh-fullmenu-product-price")).toHaveText(/R\$\s*51,90/);
  await expect(menu.locator('[data-menu-product="crispy-cheddar"]').getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  await card.getByRole("button", { name: /Ver detalhes e nutrição/ }).click();
  const purchase = menu.locator(".tbh-fullmenu-detail-purchase");
  await expect(purchase.locator(".tbh-fullmenu-product-price")).toHaveText(/R\$\s*51,90/);
  await purchase.getByRole("button", { name: /Adicionar O Praiano/ }).click();
  await page.getByRole("button", { name: /^Ver sacola$/i }).click();
  await expect(page.locator('[data-cart-product="o-praiano"]')).toContainText(/R\$\s*51,90/);
});

test("publishes catalog metadata and keeps the editorial identity after a product rename", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("burgerShop:language", "en-US"));
  const imageUrl = "/api/product-images/local-fixture.webp";
  await page.route(`**${imageUrl}`, route => route.fulfill({ path: "frontend/public/assets/products/o-praiano-384.webp" }));
  await page.route("**/api/products", route => route.fulfill({
    json: [
      { ...product, displayOrder: 20 },
      {
        ...product, code: "the-classic-4ba04d7ead65", name: "Nome atualizado", englishName: "Updated Classic",
        englishDescription: "Updated catalog description", displayOrder: 1, imageUrl
      },
    ]
  }));
  await page.goto("/");
  const showcase = page.locator('[data-product="the-classic"]');
  await expect(showcase.getByRole("heading", { name: "Updated Classic" })).toHaveCount(1);
  await openMenu(page, true);
  const modal = page.getByRole("dialog", { name: /Pick your favorite/i });
  const card = modal.locator('[data-menu-product="the-classic"]');
  await expect(modal.locator('[data-menu-product]').filter({ visible: true }).first()).toHaveAttribute("data-menu-product", "the-classic");
  await expect(card.getByText("Updated catalog description")).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", imageUrl);
  await card.locator(".tbh-fullmenu-info").click();
  await modal.getByRole("tab", { name: "NUTRITION FACTS" }).click();
  await expect(modal.getByRole("table")).toBeVisible();
  await modal.getByRole("button", { name: /Add Updated Classic/i }).click();
  await modal.getByRole("button", { name: /View bag/i }).click();
  await expect(page.locator('[data-cart-product="the-classic"]')).toContainText("Updated Classic");
});

test("catalog loading, timeout and invalid data keep buying disabled until a verified retry", async ({ page }) => {
  await page.clock.install();
  let resolveRequest!: () => void;
  const blocked = new Promise<void>(resolve => { resolveRequest = resolve; });
  await page.route("**/api/products", async route => {
    await blocked;
    await route.abort().catch(() => { });
  });
  const request = page.waitForRequest("**/api/products");
  await page.goto("/");
  await request;
  const showcase = page.locator('[data-product="o-praiano"]');
  await expect(showcase.locator(".tbh-showcase-price")).toHaveText("Conferindo preço…");
  await expect(showcase.getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  await page.clock.fastForward(10_100);
  resolveRequest();
  const notice = page.locator(".tbh-catalog-notice");
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice).toBeVisible();
  await page.route("**/api/products", route => route.fulfill({ json: [{ ...product, price: "51.90" }] }));
  await notice.getByRole("button").click();
  await expect(notice).toBeVisible();
  await expect(showcase.getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  await page.route("**/api/products", route => route.fulfill({ json: [{ ...product, price: 51.9 }] }));
  await notice.getByRole("button").click();
  await expect(showcase.locator(".tbh-showcase-price")).toHaveText(/R\$\s*51,90/);
  await expect(showcase.getByRole("button", { name: /Adicionar/ })).toBeEnabled();
});

test("Continue opens identification without submitting; Review validates intentionally", async ({ page }) => {
  await page.goto("/");
  await addPraiano(page);
  await page.evaluate(() => {
    document.addEventListener("submit", () => document.body.dataset.checkoutSubmitted = "true", true);
  });
  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await expect(page.getByRole("heading", { name: /Como vamos preparar/i })).toBeFocused();
  await expect(page.locator(".checkout-field-error")).toHaveCount(0);
  expect(await page.locator("body").getAttribute("data-checkout-submitted")).toBeNull();
  await page.getByRole("button", { name: /^Revisar pedido$/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-checkout-submitted", "true");
  await expect(page.locator(".checkout-field-error").first()).toBeVisible();
  await expect(page.getByLabel(/^Nome completo/)).toBeFocused();
});

test("static CSP allows React and cart persistence without inline script exceptions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/menu");
  expect(response?.headers()["content-security-policy"]?.split(";").map(part => part.trim())).toContain("script-src 'self'");
  await addPraiano(page);
  await page.reload();
  await page.getByRole("button", { name: /Ver sacola de pedidos, 1 itens/ }).click();
  await expect(page.getByRole("button", { name: /^Continuar$/i })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("admin static dependencies load and retain the CSRF login flow", async ({ page }) => {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.route("**/api/admin/auth/login", (route) =>
    route.fulfill({ json: { csrfToken: "local-test-csrf" } }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/orders");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("preserves English and Portuguese across the home, menu and reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Selecionar idioma/ }).click();
  await page.getByRole("group", { name: "Idioma / Language" }).getByRole("button", { name: /^English$/i }).click();
  await openMenu(page, true);
  await expect(page.getByRole("tab", { name: /^Sides/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /English selected/ })).toBeVisible();
  await openMenu(page, true);
  await expect(page.getByRole("tab", { name: /^Sides/i })).toBeVisible();
  await page.getByRole("button", { name: /^Close menu$/i }).click();
  await page.getByRole("button", { name: /Choose language/ }).click();
  await page.getByRole("group", { name: "Idioma / Language" }).getByRole("button", { name: /^Português$/i }).click();
  await openMenu(page);
  await expect(page.getByRole("tab", { name: /^Acompanhamentos/i })).toBeVisible();
});

test("removes only purchased quantities when starting another order and preserves the remainder across reloads", async ({ page }) => {
  await page.goto("/menu");
  await page.evaluate(() => {
    localStorage.setItem(
      "burger-house-drawer-cart-v1",
      JSON.stringify([
        {
          id: "o-praiano",
          code: "burger-praiano",
          name: "O Praiano",
          price: 43.9,
          quantity: 2,
          available: true,
        },
      ]),
    );
    sessionStorage.setItem(
      "burger-house-payment-v1",
      JSON.stringify({
        version: 1,
        orderId: 99,
        orderAccessToken: "synthetic-order-proof-not-a-real-token",
        paymentId: 17,
        fulfillment: "pickup",
        subtotal: 43.9,
        deliveryFee: 0,
        total: 43.9,
        items: [{ code: "burger-praiano", name: "O Praiano", quantity: 1 }],
        lines: [{ id: "o-praiano", code: "burger-praiano", name: "O Praiano", quantity: 1, price: 43.9 }],
        createdAt: new Date().toISOString(),
      }),
    );
  });
  await page.route("**/api/payments/17", (route) =>
    route.fulfill({ json: { paymentId: 17, orderId: 99, amount: 43.9, status: 2 } }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Pagamento aprovado$/i })).toBeVisible();
  const quantity = () =>
    activeCart(page).then(cart => cart[0]?.quantity);
  await expect.poll(quantity).toBe(1);
  await page.getByRole("button", { name: /^Fazer novo pedido$/i }).click();
  await expect.poll(quantity).toBeUndefined();
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Pagamento aprovado$/i })).toHaveCount(0);
  await expect.poll(quantity).toBeUndefined();
});


test('back navigation precedes titles, preserves form and restores the active step after reload', async ({ page }) => {
  await review(page);
  const back = page.getByRole('button', { name: /^Voltar à identificação$/i });
  expect((await back.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { name: /^Revise seu pedido$/i }).boundingBox())!.y);
  await expect(page.locator('.checkout-footer .checkout-back')).toHaveCount(0);
  await back.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel(/^Nome completo/)).toHaveValue('Cliente Teste');
  await page.reload();
  await expect(page.getByLabel(/^Nome completo/)).toHaveValue('Cliente Teste');
  const bagBack = page.getByRole('button', { name: /^Voltar à sacola$/i });
  expect((await bagBack.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { name: /Como vamos preparar/i }).boundingBox())!.y);
  await page.screenshot({ path: test.info().outputPath('identification-back-at-top.png'), mask: [page.locator('#checkout-cpf'), page.locator('#checkout-email'), page.locator('#checkout-phone')] });
  await bagBack.click();
  await expect(page.getByRole('heading', { name: /^Sua sacola$/i })).toBeVisible();
  await expect(page.locator('.checkout-back')).toHaveCount(0);
});

test('approved cart clears automatically across tabs, reloads and a fresh visit without touching another basket', async ({ page, context, ownerOrigin }) => {
  test.setTimeout(60000);
  let paid = false, orders = 0;
  await context.route('**/api/orders', route => route.fulfill({ status: 201, json: { orderId: 99 + orders++, orderAccessToken: "synthetic-order-proof-not-a-real-token", subtotal: 43.9, deliveryFee: 0, total: 43.9 } }));
  await context.route('**/api/checkout/99', route => route.fulfill({ json: { paymentId: 17, checkoutUrl: paymentUrl, keepStoreOpen: true } }));
  await context.route(paymentUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>Controlled sandbox</h1>' }));
  await context.route('**/api/checkout/100', route => route.fulfill({ status: 502, json: { error: 'Controlled provider unavailable' } }));
  await context.route('**/api/payments/17', route => route.fulfill({ json: { paymentId: 17, orderId: 99, amount: 43.9, status: paid ? 2 : 1 } }));
  await review(page);
  const independent = await context.newPage(); await independent.goto(ownerOrigin + '/menu?forceOpen=true');
  await addPraiano(independent);
  const otherId = await independent.evaluate(() => sessionStorage.getItem('burger-house-active-basket-v2'));
  await page.bringToFront();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^Ir para pagamento$/i }).click();
  const popup = await popupPromise; await popup.waitForURL(paymentUrl); await popup.close();
  await expect(page.getByRole('heading', { name: /^Pagamento pendente$/i })).toBeVisible();
  const restored = await context.newPage(); await restored.goto(ownerOrigin + '/menu?forceOpen=true');
  await expect(restored.getByRole('heading', { name: /^Pagamento pendente$/i })).toBeVisible();
  expect(orders).toBe(1);
  paid = true; await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: /^Pagamento aprovado$/i })).toBeVisible();
  await expect.poll(() => activeCart(page)).toEqual([]);
  await expect(page.locator('.tbh-nav-cart-count')).toHaveText('0');
  await expect.poll(() => activeCart(restored)).toEqual([]);
  expect((await activeCart(independent))[0].quantity).toBe(1);
  expect(await independent.evaluate(() => sessionStorage.getItem('burger-house-active-basket-v2'))).toBe(otherId);
  await expect(page.getByRole('button', { name: /^Consultar pagamento$/i })).toHaveCount(0);
  await expect(page.getByText('Pagamento confirmado. Seu pedido foi recebido pela hamburgueria.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('approved-cart-cleared.png') });
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Pagamento aprovado$/i })).toHaveCount(0);
  await expect.poll(() => activeCart(page)).toEqual([]);
  const fresh = await context.newPage(); await fresh.goto(ownerOrigin + '/menu');
  await expect(fresh.getByRole('button', { name: /Ver sacola de pedidos, 0 itens/ })).toBeVisible();
  await fresh.close();
  await openMenu(page);
  await page.getByRole('dialog', { name: /Escolha seu favorito/i }).getByRole('button', { name: /^Adicionar O Praiano$/i }).click();
  await page.getByRole('button', { name: /^Ver sacola$/i }).click();
  await page.getByRole('button', { name: /^Continuar$/i }).click();
  await page.getByLabel(/^Nome completo/).fill('Segundo Cliente Teste');
  await page.getByLabel('Celular com DDD').fill('11999990000');
  await page.getByRole('textbox', { name: /^E-mail$/i }).fill('segundo@example.invalid');
  await page.getByLabel(/^CPF/).fill('52998224725');
  await page.getByRole('button', { name: /^Revisar pedido$/i }).click();
  await page.getByRole('button', { name: /^Ir para pagamento$/i }).click();
  await expect.poll(() => orders).toBe(2);
  await independent.close(); await restored.close();
});

test('abandoned basket expires selectively while language survives a restored browser session', async ({ page }) => {
  await page.goto('/menu'); await addPraiano(page);
  await page.evaluate(() => {
    localStorage.setItem('burgerShop:language', 'en-US');
    const key = 'burger-house-basket-v2:' + sessionStorage.getItem('burger-house-active-basket-v2');
    const basket = JSON.parse(localStorage.getItem(key)!); basket.updatedAt = Date.now() - 31 * 60000;
    localStorage.setItem(key, JSON.stringify(basket));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: /Open bag, 0 items/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('burgerShop:language'))).toBe('en-US');
  await expect(page.locator('#home .tbh-hero-menu-cta')).toHaveCount(0);
});


test('refined checkout has accessible return navigation and sanitized screenshots at desktop tablet and mobile', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Responsive viewports exercised once with Chromium.');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/menu?forceOpen=true'); await addPraiano(page);
    await page.getByRole('button', { name: /^Continuar$/i }).click();
    const back = page.getByRole('button', { name: /^Voltar à sacola$/i });
    const title = page.getByRole('heading', { name: /Como vamos preparar/i });
    expect((await back.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y);
    const report = await new AxeBuilder({ page }).include('.checkout-layer').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: info.outputPath('refined-identification-' + width + '.png') });
  }
});


test('fresh visit removes only unbound legacy basket data while preserving language', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('burger-house-drawer-cart-v1', JSON.stringify([{ id: 'o-praiano', quantity: 3 }]));
    localStorage.setItem('burgerShop:language', 'en-US');
  });
  await page.goto('/menu');
  await expect(page.getByRole('button', { name: /Open bag, 0 items/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('burger-house-drawer-cart-v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('burgerShop:language'))).toBe('en-US');
});

test('approved payment confirmation does not reopen after close, reload or simulated app restart while preserving authorized receipt', async ({ page, context, ownerOrigin }) => {
  let approved = false;
  await page.route('**/api/orders', route => route.fulfill({
    status: 201,
    json: { orderId: 11, orderAccessToken: 'synthetic-order-proof-not-a-real-token', subtotal: 43.9, deliveryFee: 0, total: 43.9 },
  }));
  await page.route('**/api/checkout/11', route => route.fulfill({
    json: { paymentId: 17, checkoutUrl: paymentUrl, keepStoreOpen: true },
  }));
  await page.route('**/api/payments/17', route => route.fulfill({
    json: { paymentId: 17, orderId: 11, amount: 43.9, status: approved ? 'Approved' : 'Pending', method: 'Pix' },
  }));
  await context.route(paymentUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>PagBank Sandbox</h1>' }));

  await review(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^Ir para pagamento$/i }).click();
  const popup = await popupPromise;
  await popup.waitForURL(paymentUrl);
  await popup.close();

  approved = true;
  await page.bringToFront();
  await page.getByRole('button', { name: /^Consultar pagamento$/i }).click();
  await expect(page.getByRole('heading', { name: /^Pedido #11$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Pagamento aprovado$/i })).toBeVisible();

  const afterApproval = await page.evaluate(() => ({
    paymentSession: sessionStorage.getItem('burger-house-payment-v1'),
    pendingRecovery: localStorage.getItem('burger-house-pending-checkout-v2'),
    persistentReceipt: localStorage.getItem('burger-house-last-receipt-v2'),
    sessionReceipt: JSON.parse(sessionStorage.getItem('burger-house-last-receipt-v2') ?? 'null'),
  }));
  expect(afterApproval.paymentSession).toBeNull();
  expect(afterApproval.pendingRecovery).toBeNull();
  expect(afterApproval.persistentReceipt).toBeNull();
  expect(afterApproval.sessionReceipt).toEqual({
    version: 2,
    orderId: 11,
    orderAccessToken: 'synthetic-order-proof-not-a-real-token',
  });

  await page.getByRole('button', { name: /^Fechar pedido$/i }).click();
  await expect(page.locator('.tbh-order-panel')).toHaveCount(0);

  await page.getByRole('button', { name: /^Fechar cardápio$/i }).click();
  await page.getByRole('button', { name: /Ver sacola de pedidos, 0 itens/i }).click();
  await expect(page.getByRole('heading', { name: /^Sua sacola$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Pagamento aprovado$/i })).toHaveCount(0);
  await page.getByRole('button', { name: /^Fechar pedido$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Separate browser tabs or subsequent visits/restarts never receive the prior user's access token,
  // and any legacy persistent receipt or settled session from an older build is purged on load.
  const restarted = await context.newPage();
  await restarted.addInitScript(() => {
    const legacySettled = {
      version: 1,
      orderId: 11,
      orderAccessToken: 'synthetic-order-proof-not-a-real-token',
      paymentId: 17,
      fulfillment: 'pickup',
      subtotal: 43.9,
      deliveryFee: 0,
      total: 43.9,
      items: [{ code: 'burger-praiano', name: 'O Praiano', quantity: 1 }],
      createdAt: new Date().toISOString(),
      cartApplied: true,
    };
    sessionStorage.setItem('burger-house-payment-v1', JSON.stringify(legacySettled));
    localStorage.setItem('burger-house-pending-checkout-v2', JSON.stringify(legacySettled));
    localStorage.setItem('burger-house-last-receipt-v2', JSON.stringify({ expiresAt: Date.now() + 86400000, receipt: legacySettled }));
  });
  await restarted.goto(ownerOrigin + '/menu');
  await expect(restarted.getByRole('dialog')).toHaveCount(0);
  const cleaned = await restarted.evaluate(() => ({
    paymentSession: sessionStorage.getItem('burger-house-payment-v1'),
    pendingRecovery: localStorage.getItem('burger-house-pending-checkout-v2'),
    persistentReceipt: localStorage.getItem('burger-house-last-receipt-v2'),
    sessionReceipt: sessionStorage.getItem('burger-house-last-receipt-v2'),
  }));
  expect(cleaned.paymentSession).toBeNull();
  expect(cleaned.pendingRecovery).toBeNull();
  expect(cleaned.persistentReceipt).toBeNull();
  expect(cleaned.sessionReceipt).toBeNull();
  await restarted.close();
});

test('pending checkout stays recoverable across close and reload while rejected never poses as approved', async ({ page, context }) => {
  let paymentStatus: 'Pending' | 'Rejected' = 'Pending';
  await page.route('**/api/orders', route => route.fulfill({
    status: 201,
    json: { orderId: 21, orderAccessToken: 'synthetic-order-proof-not-a-real-token', subtotal: 43.9, deliveryFee: 0, total: 43.9 },
  }));
  await page.route('**/api/checkout/21', route => route.fulfill({
    json: { paymentId: 31, checkoutUrl: paymentUrl, keepStoreOpen: true },
  }));
  await page.route('**/api/payments/31', route => route.fulfill({
    json: { paymentId: 31, orderId: 21, amount: 43.9, status: paymentStatus, method: 'Pix' },
  }));
  await context.route(paymentUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>PagBank Sandbox</h1>' }));

  await review(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^Ir para pagamento$/i }).click();
  const popup = await popupPromise;
  await popup.waitForURL(paymentUrl);
  await popup.close();

  await expect(page.getByRole('heading', { name: /^Pagamento pendente$/i })).toBeVisible();
  await page.getByRole('button', { name: /^Fechar pedido$/i }).click();
  await expect(page.locator('.tbh-order-panel')).toHaveCount(0);

  await page.getByRole('button', { name: /^Fechar cardápio$/i }).click();
  await page.getByRole('button', { name: /Ver sacola de pedidos/i }).click();
  await expect(page.getByRole('heading', { name: /^Pagamento pendente$/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Pedido #21$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Pagamento pendente$/i })).toBeVisible();

  paymentStatus = 'Rejected';
  await page.getByRole('button', { name: /^Consultar pagamento$/i }).click();
  await expect(page.getByRole('heading', { name: /^Pagamento recusado$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Pagamento aprovado$/i })).toHaveCount(0);
  expect(await activeCart(page)).toHaveLength(1);
});
