import { existsSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { storefrontHtml } from "./storefront-html.js";

describe("current SSR landing", () => {
  const document = new JSDOM(storefrontHtml()).window.document;

  it("renders the current campaign and a working journey to the menu", () => {
    expect(document.querySelector("h1").textContent).toContain("3 novos burgers.");
    expect(document.querySelectorAll('a[href="/menu"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll("script[nonce]").length).toBeGreaterThan(0);
  });

  it("loads all three launch photographs and keeps menu as a separate page", () => {
    for (const image of ["crispy-chicken.webp", "onion-rings.webp", "praiano.webp"]) {
      const path = `/assets/produtos/hamburgueres/${image}`;
      expect(document.querySelector(`img[src="${path}"]`)).not.toBeNull();
      expect(existsSync(`.vercel/output/static${path}`)).toBe(true);
    }
    expect(new JSDOM(storefrontHtml("/menu")).window.document.querySelector("h1").textContent).toBe(
      "Cardápio",
    );
  });
});
