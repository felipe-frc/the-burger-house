// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,

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
      createJsonResponse({
        success: true,
      }),
    ),
  );
});

describe("payment API", () => {
  it("keeps credit card as the backward-compatible default payload", async () => {
    const { createPayment } = await import("../scripts/api.js");

    await createPayment(100, "11111111-1111-4111-8111-111111111111");

    expect(fetch).toHaveBeenCalledOnce();

    const [url, options] = fetch.mock.calls[0];

    expect(url).toContain("/api/payments");

    expect(options.method).toBe("POST");

    expect(JSON.parse(options.body)).toEqual({
      orderId: 100,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("sends Pix as payment method 1", async () => {
    const { createPayment } = await import("../scripts/api.js");

    await createPayment(100, "11111111-1111-4111-8111-111111111111", 1);

    const [, options] = fetch.mock.calls[0];

    expect(JSON.parse(options.body)).toEqual({
      orderId: 100,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      method: 1,
    });
  });

  it("sends debit card as payment method 3", async () => {
    const { createPayment } = await import("../scripts/api.js");

    await createPayment(100, "11111111-1111-4111-8111-111111111111", 3);

    const [, options] = fetch.mock.calls[0];

    expect(JSON.parse(options.body)).toEqual({
      orderId: 100,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      method: 3,
    });
  });

  it("uses the Pix processing endpoint", async () => {
    const { processPixPayment } = await import("../scripts/api.js");

    await processPixPayment(200, {
      payerEmail: "cliente@email.com",
    });

    expect(fetch).toHaveBeenCalledOnce();

    const [url, options] = fetch.mock.calls[0];

    expect(url).toContain("/api/payments/200/pix");

    expect(options.method).toBe("POST");

    expect(JSON.parse(options.body)).toEqual({
      payerEmail: "cliente@email.com",
    });
  });
});
