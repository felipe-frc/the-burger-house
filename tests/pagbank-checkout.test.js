// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  createCheckout: vi.fn(),
  getPaymentStatus: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
  cart: [{ id: "burger-praiano", quantity: 1, price: 43.9 }],
  validAddress: true,
  orderType: "pickup",
}));
vi.mock("../scripts/api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ...mocks,
}));
vi.mock("../scripts/cart.js", () => ({
  getCartSubtotal: () => 43.9,
  getCartTotalWithDelivery: () => 43.9,
  getDeliveryFee: () => 0,
  updateCart: vi.fn(),
}));
vi.mock("../scripts/state.js", () => ({
  getCart: () => mocks.cart,
  getOrderType: () => mocks.orderType,
  ORDER_TYPES: { PICKUP: "pickup" },
  clearCart: vi.fn(),
  resetOrderType: vi.fn(),
}));
vi.mock("../scripts/address.js", () => ({
  getAddressText: () => "Rua dos Testes 123",
  getIsFetchingCep: () => false,
  isPickupOrder: () => mocks.orderType === "pickup",
  resetAddressForm: vi.fn(),
  validateAddressFields: () => mocks.validAddress,
}));
vi.mock("../scripts/utils.js", () => ({
  escapeHTML: (value) => value,
  formatPrice: (value) => String(value),
  isStoreOpenNow: () => true,
}));
vi.mock("../scripts/ui.js", () => ({
  elements: {},
  closeAllModals: vi.fn(),
  openModal: vi.fn(),
  hidePaymentError: vi.fn(),
  showPaymentError: mocks.error,
  showToast: mocks.toast,
  showAddressWarning: vi.fn(),
  showClosedStoreMessage: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
  mocks.validAddress = true;
  mocks.orderType = "pickup";
  mocks.cart = [{ id: "burger-praiano", quantity: 1, price: 43.9 }];
  document.body.innerHTML =
    '<input id="customer-name" value="Cliente Teste" /><input id="customer-phone" value="11999990000" /><input id="customer-email" value="cliente@teste.com" /><input id="customer-tax-id" value="52998224725" /><p id="checkout-status"></p><button id="check-payment-btn"></button><button id="confirm-whatsapp-btn" class="hidden"></button>';
  mocks.createOrder.mockResolvedValue({ orderId: 99, subtotal: 43.9, deliveryFee: 0, total: 43.9 });
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    checkoutUrl: "https://pagamento.pagbank.com.br/checkout/CHEC_test",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("creates an order and PagBank checkout, preserving return context without choosing a method", async () => {
  const { openPaymentStep } = await import("../scripts/order.js");
  await openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledWith({
    orderType: "pickup",
    items: [{ productCode: "burger-praiano", quantity: 1, observation: null }],
    customerName: "Cliente Teste",
    customerPhone: "11999990000",
    customerEmail: "cliente@teste.com",
    customerTaxId: "52998224725",
    zipCode: null,
    street: null,
    houseNumber: null,
    neighborhood: null,
    city: null,
    complement: null,
    observation: null,
  });
  expect(mocks.createCheckout).toHaveBeenCalledWith(99);
  const context = JSON.parse(sessionStorage.getItem("burger-house-checkout"));
  expect(context.paymentId).toBe(17);
  expect(context.message).toContain("Rua dos Testes 123");
  expect(context.message).not.toContain("cliente@teste.com");
  expect(context.message).not.toContain("52998224725");
  expect(context).not.toHaveProperty("paymentMethod");
});

it("requires the final checkoutUrl contract", async () => {
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
  });

  await (await import("../scripts/order.js")).openPaymentStep();

  expect(mocks.createCheckout).toHaveBeenCalledWith(99);
  expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).paymentId).toBeNull();
  expect(mocks.toast).toHaveBeenCalledWith("Invalid URL");
});

it("accepts the current PagBank Sandbox checkout host", async () => {
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    checkoutUrl: "https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
  });

  await (await import("../scripts/order.js")).openPaymentStep();

  expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).paymentId).toBe(17);
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("rejects a lookalike of the PagBank Sandbox checkout host", async () => {
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    checkoutUrl: "https://pagamento.sandbox.pagbank.com.br.evil.example/pagamento?code=teste",
  });

  await (await import("../scripts/order.js")).openPaymentStep();

  expect(mocks.toast).toHaveBeenCalledWith("O checkout retornou um endereço inválido.");
  expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).paymentId).toBeNull();
});

it("does not create checkout if the order fails", async () => {
  mocks.createOrder.mockRejectedValue(new Error("offline"));
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.createCheckout).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalled();
});

it("reuses the order on checkout retry and prevents simultaneous submissions", async () => {
  mocks.createCheckout.mockRejectedValue(new Error("offline"));
  const { openPaymentStep } = await import("../scripts/order.js");
  await Promise.all([openPaymentStep(), openPaymentStep()]);
  await openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledTimes(1);
  expect(mocks.createCheckout).toHaveBeenCalledTimes(2);
});

it("preserves delivery selection and blocks invalid addresses", async () => {
  mocks.orderType = "delivery";
  mocks.validAddress = false;
  const { openPaymentStep } = await import("../scripts/order.js");
  await openPaymentStep();
  expect(mocks.createOrder).not.toHaveBeenCalled();
  mocks.validAddress = true;
  await openPaymentStep();
  expect(mocks.createOrder.mock.calls[0][0].orderType).toBe("delivery");
});

it.each(["createOrder", "createCheckout"])("shows safe API errors from %s", async (operation) => {
  const { ApiError } = await import("../scripts/api.js");
  mocks[operation].mockRejectedValue(
    new ApiError("Fallback error", 409, {
      error: "Não foi possível preparar o pedido neste momento.",
      token: "do-not-log-token",
      customer: { cpf: "12345678900", address: "private-address" },
    }),
  );
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("Não foi possível preparar o pedido neste momento.");
  expect(console.error).toHaveBeenCalledWith("Checkout preparation failed", {
    name: "ApiError",
    status: 409,
  });
  const logs = JSON.stringify(console.error.mock.calls);
  expect(logs).not.toContain("do-not-log-token");
  expect(logs).not.toContain("12345678900");
  expect(logs).not.toContain("private-address");
  expect(logs).not.toContain("Fallback error");
  if (operation === "createOrder") expect(mocks.createCheckout).not.toHaveBeenCalled();
});

it.each([
  "Bearer super-secret",
  "token=private-credential",
  "Falha em https://internal.example/api?key=private-credential",
  "Erro\n at checkout (internal.js:10:1)",
  "CPF 123.456.789-00",
])("does not expose unsafe error text: %s", async (message) => {
  const { ApiError } = await import("../scripts/api.js");
  const error = new ApiError(message, 502, { error: message, secret: "hidden-secret" });
  error.name = "private-name";
  mocks.createCheckout.mockRejectedValue(error);
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("Não foi possível abrir o checkout. Tente novamente.");
  const logs = JSON.stringify(console.error.mock.calls);
  expect(logs).not.toContain(message);
  expect(logs).not.toContain("hidden-secret");
  expect(logs).not.toContain("private-name");
});

it("never logs personal text echoed in an API error", async () => {
  const { ApiError } = await import("../scripts/api.js");
  const personal = "Cliente Maria Silva Rua das Flores";
  mocks.createOrder.mockRejectedValue(new ApiError(personal, 400, { error: personal }));
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(console.error).toHaveBeenCalledWith("Checkout preparation failed", {
    name: "ApiError",
    status: 400,
  });
  expect(JSON.stringify(console.error.mock.calls)).not.toContain(personal);
});

it("shows a safe Error message without logging its stack or custom properties", async () => {
  const error = new Error("Falha de conexão. Tente novamente.");
  error.token = "private-token";
  error.stack = "private-stack";
  mocks.createOrder.mockRejectedValue(error);
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith(error.message);
  expect(JSON.stringify(console.error.mock.calls)).not.toContain("private-");
});

it.each([
  [undefined, false],
  ["https://evil.example/payment", false],
  ["https://pagamento.pagbank.com.br/checkout/CHEC_test", true],
  ["https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste", true],
])("preserves redirect behavior for %s", async (checkoutUrl, allowed) => {
  mocks.createCheckout.mockResolvedValue({ paymentId: 17, checkoutUrl });
  const { openPaymentStep } = await import("../scripts/order.js");
  const location = { href: "https://shop.example/" };
  vi.stubGlobal("window", { location });
  await openPaymentStep();
  expect(location.href).toBe(allowed ? checkoutUrl : "https://shop.example/");
});

it("preserves a safe HTTP status message when the API has no error field", async () => {
  const { ApiError } = await import("../scripts/api.js");
  mocks.createCheckout.mockRejectedValue(new ApiError("A API retornou o status 502.", 502));
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("A API retornou o status 502.");
});

it("uses the fallback without logging arbitrary thrown objects", async () => {
  mocks.createOrder.mockRejectedValue({ message: "private-value", token: "private-token" });
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("Não foi possível abrir o checkout. Tente novamente.");
  expect(console.error).not.toHaveBeenCalled();
});

it.each(["delivery", "pickup"])(
  "sends complete %s fulfillment before creating checkout",
  async (type) => {
    mocks.orderType = type;
    const values = {
      "customer-name": " Cliente Teste ",
      "customer-phone": " 11999990000 ",
      "customer-email": " cliente@teste.com ",
      "customer-tax-id": " 529.982.247-25 ",
      cep: " 38400-000 ",
      street: " Rua Teste ",
      "house-number": " 10 ",
      neighborhood: " Centro ",
      city: " Cidade ",
      complement: " Apto ",
      "order-notes": " Sem cebola ",
    };
    for (const [id, value] of Object.entries(values)) {
      let input = document.getElementById(id);
      if (!input) {
        input = document.createElement("input");
        input.id = id;
        document.body.append(input);
      }
      input.value = value;
    }
    await (await import("../scripts/order.js")).openPaymentStep();
    const details = mocks.createOrder.mock.calls[0][0];
    expect(details).toEqual({
      orderType: type,
      items: [{ productCode: "burger-praiano", quantity: 1, observation: null }],
      customerName: "Cliente Teste",
      customerPhone: "11999990000",
      customerEmail: "cliente@teste.com",
      customerTaxId: "52998224725",
      zipCode: type === "delivery" ? "38400-000" : null,
      street: type === "delivery" ? "Rua Teste" : null,
      houseNumber: type === "delivery" ? "10" : null,
      neighborhood: type === "delivery" ? "Centro" : null,
      city: type === "delivery" ? "Cidade" : null,
      complement: type === "delivery" ? "Apto" : null,
      observation: "Sem cebola",
    });
    expect(mocks.createOrder.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createCheckout.mock.invocationCallOrder[0],
    );
    expect(details.items[0].observation).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).fingerprint).toBe(
      "v2:" + JSON.stringify(details),
    );
  },
);

it.each([
  ["customer-name", " "],
  ["customer-phone", ""],
  ["customer-phone", "123"],
  ["customer-phone", "3433334444"],
  ["customer-phone", "34888888888"],
  ["customer-phone", "349999999999"],
  ["customer-email", ""],
  ["customer-email", "invalido"],
  ["customer-email", "cliente@@teste.com"],
  ["customer-email", "x".repeat(245) + "@teste.com"],
  ["customer-tax-id", ""],
  ["customer-tax-id", "11111111111"],
  ["customer-tax-id", "00000000000"],
  ["customer-tax-id", "52998224724"],
  ["customer-tax-id", "52998224825"],
  ["customer-tax-id", "5299822472"],
  ["customer-tax-id", "a52998224725"],
])("blocks missing or invalid customer field %s", async (id, value) => {
  document.getElementById(id).value = value;
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.createOrder).not.toHaveBeenCalled();
  expect(mocks.createCheckout).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

it("creates a new order after fulfillment edits instead of paying stale customer details", async () => {
  mocks.createCheckout.mockRejectedValue(new Error("offline"));
  const { openPaymentStep } = await import("../scripts/order.js");
  await openPaymentStep();
  document.getElementById("customer-phone").value = "11988880000";
  await openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledTimes(2);
  expect(mocks.createOrder.mock.calls[1][0].customerPhone).toBe("11988880000");
});

function fillFulfillment(overrides = {}) {
  const fields = {
    "customer-name": "Cliente Teste",
    "customer-phone": "11999990000",
    "customer-email": "cliente@teste.com",
    "customer-tax-id": "52998224725",
    cep: "38400-000",
    street: "Rua Teste",
    "house-number": "10",
    neighborhood: "Centro",
    city: "Cidade",
    complement: "Apto",
    "order-notes": "Sem cebola",
    ...overrides,
  };
  for (const [id, value] of Object.entries(fields)) {
    let input = document.getElementById(id);
    if (!input) {
      input = document.createElement("input");
      input.id = id;
      document.body.append(input);
    }
    input.value = value;
  }
  return fields;
}

it("sends a masked mobile phone as digits only", async () => {
  document.getElementById("customer-phone").value = "(34) 99999-9999";
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.createOrder.mock.calls[0][0].customerPhone).toBe("34999999999");
  expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
});

it.each(["3433334444", "34888888888"])(
  "explains invalid mobile %s before checkout",
  async (phone) => {
    document.getElementById("customer-phone").value = phone;
    await (await import("../scripts/order.js")).openPaymentStep();
    const { showAddressWarning } = await import("../scripts/ui.js");
    expect(showAddressWarning).toHaveBeenCalledWith("Informe um celular válido com DDD.");
    expect(mocks.createOrder).not.toHaveBeenCalled();
  },
);

function currentSession() {
  return JSON.parse(sessionStorage.getItem("burger-house-checkout"));
}

it.each([
  ["customer-name", "Outro Cliente"],
  ["customer-phone", "11988880000"],
  ["customer-email", "outro@teste.com"],
  ["customer-tax-id", "11144477735"],
  ["cep", "38401-000"],
  ["street", "Outra Rua"],
  ["house-number", "20"],
  ["neighborhood", "Outro Bairro"],
  ["city", "Outra Cidade"],
  ["complement", "Casa"],
  ["order-notes", "Sem picles"],
  ["order-notes", ""],
])("does not restore or reuse an old order when %s changes", async (field, value) => {
  mocks.orderType = "delivery";
  fillFulfillment();
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  let order = await import("../scripts/order.js");
  await order.openPaymentStep();
  const previous = currentSession();
  document.getElementById(field).value = value;

  // Reload the module to exercise stored session recovery, not only in-memory retries.
  vi.resetModules();
  order = await import("../scripts/order.js");
  order.bindOrderEvents();
  expect(document.getElementById(field).value).toBe(value);
  mocks.createOrder.mockResolvedValue({
    orderId: 100,
    subtotal: 43.9,
    deliveryFee: 5,
    total: 48.9,
  });
  await order.openPaymentStep();

  expect(mocks.createOrder).toHaveBeenCalledTimes(2);
  expect(mocks.createCheckout).toHaveBeenLastCalledWith(100);
  expect(currentSession().fingerprint).not.toBe(previous.fingerprint);
  expect(currentSession().fingerprint).toBe(
    "v2:" + JSON.stringify(mocks.createOrder.mock.calls[1][0]),
  );
});

it("reuses identical normalized fulfillment after recovery and whitespace edits", async () => {
  mocks.orderType = "delivery";
  const fields = fillFulfillment({ complement: "", "order-notes": "" });
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  let order = await import("../scripts/order.js");
  await order.openPaymentStep();
  const identity = currentSession().fingerprint;
  for (const [id, value] of Object.entries(fields))
    document.getElementById(id).value = " " + value + " ";
  document.getElementById("customer-tax-id").value = " 529.982.247-25 ";
  vi.resetModules();
  order = await import("../scripts/order.js");
  order.bindOrderEvents();
  await order.openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledTimes(1);
  expect(mocks.createCheckout).toHaveBeenCalledTimes(2);
  expect(currentSession().fingerprint).toBe(identity);
});

it("ignores pickup address leftovers in both payload and identity", async () => {
  fillFulfillment();
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  const order = await import("../scripts/order.js");
  await order.openPaymentStep();
  const identity = currentSession().fingerprint;
  for (const id of ["cep", "street", "house-number", "neighborhood", "city", "complement"])
    document.getElementById(id).value = "changed unused address";
  await order.openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledTimes(1);
  expect(currentSession().fingerprint).toBe(identity);
  const payload = mocks.createOrder.mock.calls[0][0];
  for (const key of ["zipCode", "street", "houseNumber", "neighborhood", "city", "complement"])
    expect(payload[key]).toBeNull();
});

it("never reuses a legacy cart-only identity for a new checkout", async () => {
  const fields = fillFulfillment();
  sessionStorage.setItem(
    "burger-house-checkout",
    JSON.stringify({
      orderId: 44,
      total: 43.9,
      fields,
      fingerprint: JSON.stringify({
        orderType: "pickup",
        items: [{ productCode: "burger-praiano", quantity: 1, observation: null }],
      }),
    }),
  );
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  const order = await import("../scripts/order.js");
  order.bindOrderEvents();
  await order.openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledOnce();
  expect(mocks.createCheckout).toHaveBeenCalledWith(99);
  expect(currentSession().orderId).toBe(99);
});

it("restores a blank return form only when the stored full identity matches", async () => {
  mocks.orderType = "delivery";
  const fields = fillFulfillment();
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  let order = await import("../scripts/order.js");
  await order.openPaymentStep();
  for (const id of Object.keys(fields)) document.getElementById(id).value = "";
  vi.resetModules();
  order = await import("../scripts/order.js");
  order.bindOrderEvents();
  for (const [id, value] of Object.entries(fields))
    expect(document.getElementById(id).value).toBe(value);
  await order.openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledOnce();
});

it("does not restore saved fulfillment over a different cart", async () => {
  const fields = fillFulfillment();
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  let order = await import("../scripts/order.js");
  await order.openPaymentStep();
  for (const id of Object.keys(fields)) document.getElementById(id).value = "";
  mocks.cart = [{ ...mocks.cart[0], quantity: 2 }];
  vi.resetModules();
  order = await import("../scripts/order.js");
  order.bindOrderEvents();
  expect(document.getElementById("customer-name").value).toBe("");
});

it("keeps identity and saved fields tied to the submitted snapshot during async creation", async () => {
  fillFulfillment();
  let resolveOrder;
  mocks.createOrder.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOrder = resolve;
      }),
  );
  mocks.createCheckout.mockRejectedValue(new Error("Checkout unavailable"));
  const order = await import("../scripts/order.js");
  const pending = order.openPaymentStep();
  const payload = mocks.createOrder.mock.calls[0][0];
  document.getElementById("customer-name").value = "Edited While Waiting";
  resolveOrder({ orderId: 99, subtotal: 43.9, deliveryFee: 0, total: 43.9 });
  await pending;
  expect(currentSession().fields["customer-name"]).toBe(payload.customerName);
  expect(currentSession().fingerprint).toBe("v2:" + JSON.stringify(payload));
  await order.openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledTimes(2);
  expect(mocks.createOrder.mock.calls[1][0].customerName).toBe("Edited While Waiting");
});

it("does not overwrite the snapshot or message while checkout is pending", async () => {
  fillFulfillment({ "order-notes": "Original observation" });
  let resolveCheckout;
  mocks.createCheckout.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCheckout = resolve;
      }),
  );
  const order = await import("../scripts/order.js");
  const pending = order.openPaymentStep();
  await vi.waitFor(() => expect(mocks.createCheckout).toHaveBeenCalledOnce());
  document.getElementById("order-notes").value = "Edited observation";
  resolveCheckout({
    paymentId: 17,
    checkoutUrl: "https://pagamento.pagbank.com.br/checkout/CHEC_test",
  });
  await pending;
  expect(currentSession().fields["order-notes"]).toBe("Original observation");
  expect(currentSession().message).toContain("Original observation");
  expect(currentSession().message).not.toContain("Edited observation");
  expect(console.error).not.toHaveBeenCalled();
});

function savedContext() {
  sessionStorage.setItem(
    "burger-house-checkout",
    JSON.stringify({
      orderId: 99,
      paymentId: 17,
      total: 43.9,
      fingerprint: "saved",
      message: "pedido",
      confirmationDispatched: false,
    }),
  );
}

it("ignores approved URL parameters and uses the local backend status", async () => {
  savedContext();
  window.history.replaceState({}, "", "/?status=approved&payment_id=666");
  mocks.getPaymentStatus.mockResolvedValue({ paymentId: 17, orderId: 99, amount: 43.9, status: 1 });
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(mocks.getPaymentStatus).toHaveBeenCalledWith(17);
  expect(document.getElementById("confirm-whatsapp-btn").classList.contains("hidden")).toBe(true);
  expect(document.getElementById("checkout-status").textContent).toContain("Aguardando");
});

it("enables WhatsApp only for a matching locally approved payment", async () => {
  savedContext();
  mocks.getPaymentStatus.mockResolvedValue({ paymentId: 17, orderId: 99, amount: 43.9, status: 2 });
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(document.getElementById("confirm-whatsapp-btn").classList.contains("hidden")).toBe(false);
});

it("rejects a payment from another order", async () => {
  savedContext();
  mocks.getPaymentStatus.mockResolvedValue({
    paymentId: 17,
    orderId: 100,
    amount: 43.9,
    status: 2,
  });
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(mocks.error).toHaveBeenCalled();
  expect(document.getElementById("confirm-whatsapp-btn").classList.contains("hidden")).toBe(true);
});

it("never confirms without saved local context", async () => {
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(mocks.getPaymentStatus).not.toHaveBeenCalled();
});
