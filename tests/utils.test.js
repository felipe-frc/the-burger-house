import { describe, expect, it } from "vitest";
import { escapeHTML, formatPrice, isValidHouseNumber } from "../scripts/utils.js";

function normalizeCurrency(value) {
  return value.replace(/\u00A0/g, " ");
}

describe("utils", () => {
  it("formats values as Brazilian currency", () => {
    expect(normalizeCurrency(formatPrice(43.9))).toBe("R$ 43,90");
    expect(normalizeCurrency(formatPrice(0))).toBe("R$ 0,00");
    expect(normalizeCurrency(formatPrice(5.9))).toBe("R$ 5,90");
  });

  it("escapes unsafe HTML characters", () => {
    expect(escapeHTML('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );

    expect(escapeHTML("Hambúrguer & Batata")).toBe("Hambúrguer &amp; Batata");
  });

  it("validates house numbers with digits only", () => {
    expect(isValidHouseNumber("123")).toBe(true);
    expect(isValidHouseNumber(" 456 ")).toBe(true);
    expect(isValidHouseNumber("12A")).toBe(false);
    expect(isValidHouseNumber("S/N")).toBe(false);
    expect(isValidHouseNumber("")).toBe(false);
  });
});