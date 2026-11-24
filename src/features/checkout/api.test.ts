import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrder, isAllowedCheckoutUrl, normalizePaymentStatus } from "./api";
import { emptyCheckoutForm } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("checkout API", () => {
  it("builds the real order payload without browser totals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ orderId: 7, subtotal: 35.9, deliveryFee: 0, total: 35.9 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createOrder(
      {
        ...emptyCheckoutForm,
        fulfillment: "pickup",
        customerName: "Maria Silva",
        phone: "(11) 98765-4321",
        email: "maria@example.com",
        cpf: "529.982.247-25",
      },
      [
        {
          id: "burger",
          code: "burger-praiano",
          name: "O Praiano",
          price: 43.9,
          image: "/burger.webp",
          imageAlt: "Burger",
          available: true,
          quantity: 2,
        },
      ],
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      orderType: "pickup",
      customerPhone: "11987654321",
      customerTaxId: "52998224725",
      items: [{ productCode: "burger-praiano", quantity: 2, observation: null }],
    });
    expect(body).not.toHaveProperty("total");
    expect(body.zipCode).toBeNull();
  });

  it("accepts only trusted PagBank checkout hosts", () => {
    expect(isAllowedCheckoutUrl("https://pagamento.pagbank.com.br/checkout/abc")).toBe(true);
    expect(isAllowedCheckoutUrl("https://pagamento.sandbox.pagbank.com.br/checkout/abc")).toBe(
      true,
    );
    expect(isAllowedCheckoutUrl("https://pagamento.pagbank.com.br.evil.test/checkout")).toBe(false);
    expect(isAllowedCheckoutUrl("http://pagamento.pagbank.com.br/checkout")).toBe(false);
  });

  it("normalizes numeric payment states", () => {
    expect(normalizePaymentStatus(1)).toBe("Pending");
    expect(normalizePaymentStatus(2)).toBe("Approved");
    expect(normalizePaymentStatus(7)).toBe("ChargedBack");
  });
});
