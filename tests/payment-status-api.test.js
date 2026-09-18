// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

function response(data) {
  return {
    ok: true,
    status: 200,

    headers: {
      get: vi.fn(() => "application/json"),
    },

    json: vi.fn(async () => data),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({
        paymentId: 200,
        orderId: 100,
        amount: 48.9,
        status: 1,
        method: 1,
      }),
    ),
  );
});

describe("payment status API", () => {
  it("gets the current payment status", async () => {
    const { getPaymentStatus } = await import("../scripts/api.js");

    const result = await getPaymentStatus(200);

    expect(fetch).toHaveBeenCalledOnce();

    const [url, options] = fetch.mock.calls[0];

    expect(url).toContain("/api/payments/200");

    expect(options.method).toBe("GET");

    expect(result.status).toBe(1);

    expect(result.method).toBe(1);
  });
});

it("posts the order and obtains Checkout Pro without card data", async () => {
  const { createOrder, createCheckout } = await import("../scripts/api.js");
  const items = [{ productCode: "burger-praiano", quantity: 1, observation: null }];
  await createOrder("pickup", items);
  await createCheckout(99);
  expect(fetch.mock.calls[0][0]).toContain("/api/orders");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ orderType: "pickup", items });
  expect(fetch.mock.calls[1][0]).toContain("/api/checkout/99");
  expect(fetch.mock.calls[1][1].method).toBe("POST");
  expect(fetch.mock.calls[1][1].body).toBeUndefined();
});
it("preserves API error status and safe message for checkout retries", async () => {
  fetch.mockResolvedValue({
    ...response({ error: "Checkout unavailable" }),
    ok: false,
    status: 409,
  });
  const { createCheckout } = await import("../scripts/api.js");
  await expect(createCheckout(99)).rejects.toMatchObject({
    name: "ApiError",
    status: 409,
    message: "Checkout unavailable",
  });
  fetch.mockResolvedValue({ ok: false, status: 502, headers: { get: () => null } });
  await expect(createCheckout(99)).rejects.toMatchObject({
    status: 502,
    message: "A API retornou o status 502.",
  });
});
