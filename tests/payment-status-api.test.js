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
