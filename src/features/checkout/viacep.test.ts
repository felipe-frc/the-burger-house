import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupCep } from "./viacep";

afterEach(() => vi.unstubAllGlobals());

describe("ViaCEP", () => {
  it("maps a successful lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            cep: "01001-000",
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(lookupCep("01001-000")).resolves.toEqual({
      zipCode: "01001-000",
      street: "Praça da Sé",
      neighborhood: "Sé",
      city: "São Paulo",
    });
  });

  it("reports invalid and missing postal codes", async () => {
    await expect(lookupCep("123")).rejects.toMatchObject({ kind: "invalid" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ erro: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(lookupCep("01001000")).rejects.toMatchObject({ kind: "not-found" });
  });
});
