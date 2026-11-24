// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BurgerMenu } from "../frontend/src/components/BurgerMenu";

// Render with the same React installation that supplies the storefront hooks.
const frontend = createRequire(resolve("frontend/package.json"));
const { createElement } = frontend("react");
const { renderToStaticMarkup } = frontend("react-dom/server");

describe("launch and menu preview content", () => {
  beforeEach(() => {
    document.body.innerHTML = renderToStaticMarkup(createElement(BurgerMenu, {
      storefrontCatalog: { catalogState: "error", catalog: [] },
    }));
  });

  it("presents all three established launches in the current storefront", () => {
    const names = Array.from(document.querySelectorAll("#menu article h3"), node => node.textContent);
    for (const name of ["Crispy Cheddar", "Onion Crunch", "O Praiano"]) {
      expect(names.filter(value => value === name)).toHaveLength(1);
    }
  });

  it("keeps the full menu available and requires verified prices before purchase", () => {
    const cards = document.querySelectorAll("#menu article");
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      expect(card.querySelector('button[aria-label^="Adicionar "]')?.disabled).toBe(true);
      expect(card.textContent).toContain("Preço indisponível");
      expect(card.querySelector('a[href*="pagamento."]')).toBeNull();
    }
    expect(document.querySelector("#menu .tbh-showcase-all")?.textContent).toContain("VER CARDÁPIO COMPLETO");
  });
});
