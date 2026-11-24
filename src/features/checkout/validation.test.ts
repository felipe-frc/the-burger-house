import { describe, expect, it } from "vitest";
import { emptyCheckoutForm } from "./types";
import { formatCep, formatCpf, formatPhone, isValidCpf, validateDetails } from "./validation";

describe("checkout validation", () => {
  it("formats Brazilian customer fields", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCep("01001000")).toBe("01001-000");
  });

  it("validates CPF check digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });

  it("requires address only for delivery", () => {
    const base = {
      ...emptyCheckoutForm,
      customerName: "Maria da Silva",
      phone: "(11) 98765-4321",
      email: "maria@example.com",
      cpf: "529.982.247-25",
    };
    expect(validateDetails({ ...base, fulfillment: "delivery" }).zipCode).toBeDefined();
    expect(validateDetails({ ...base, fulfillment: "pickup" })).toEqual({});
  });

  it("rejects emails accepted by an order but unsupported by hosted PagBank checkout", () => {
    expect(validateDetails({ ...emptyCheckoutForm, email: "a@b.co" }).email).toContain("PagBank");
    expect(
      validateDetails({ ...emptyCheckoutForm, email: `${"a".repeat(60)}@example.com` }).email,
    ).toContain("PagBank");
  });
});
