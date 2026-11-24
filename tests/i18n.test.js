// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  getLocalizedEntity,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  translate,
  translateItemCount,
  bindLanguageSwitcher,
  applyStaticTranslations,
} from "../scripts/i18n.js";

describe("i18n", () => {
  it("translates retained static labels immediately when switching language", () => {
    document.body.innerHTML =
      '<h1 data-i18n="rebrand.hero.title"></h1><a data-i18n="rebrand.nav.order"></a><select id="language-select"><option value="pt-BR">PT</option><option value="en-US">EN</option></select>';
    applyStaticTranslations("pt-BR");
    bindLanguageSwitcher();
    const title = document.querySelector('[data-i18n="rebrand.hero.title"]');
    expect(title.textContent).toBe("Fome não espera.");
    const select = document.getElementById("language-select");
    select.value = "en-US";
    select.dispatchEvent(new Event("change"));
    expect(title.textContent).toBe("Hunger won't wait.");
    expect(document.querySelector('[data-i18n="rebrand.nav.order"]').textContent).toBe("Order now");
    select.value = "pt-BR";
    select.dispatchEvent(new Event("change"));
    expect(title.textContent).toBe("Fome não espera.");
    localStorage.clear();
  });

  it("translates retained static category and product labels", () => {
    document.body.innerHTML =
      '<h1 data-i18n="menu.eyebrow"></h1><h2 data-i18n="menu.category.drinks"></h2><h3 data-i18n="menu.product.crispy.name"></h3><p data-i18n="menu.product.orangeJuice.description"></p>';
    applyStaticTranslations("en-US");

    expect(document.querySelector('[data-i18n="menu.eyebrow"]').textContent).toBe("OUR MENU");
    expect(document.querySelector('[data-i18n="menu.category.drinks"]').textContent).toBe("DRINKS");
    expect(document.querySelector('[data-i18n="menu.product.crispy.name"]').textContent).toBe(
      "Crispy Chicken",
    );
    expect(
      document.querySelector('[data-i18n="menu.product.orangeJuice.description"]').textContent,
    ).toContain("orange juice");
  });
  it("defines supported languages", () => {
    expect(DEFAULT_LANGUAGE).toBe(SUPPORTED_LANGUAGES.PT_BR);
    expect(isSupportedLanguage("pt-BR")).toBe(true);
    expect(isSupportedLanguage("en-US")).toBe(true);
    expect(isSupportedLanguage("es-ES")).toBe(false);
  });

  it("translates known keys and falls back to the key when missing", () => {
    expect(translate("cart.title", "pt-BR")).toBe("Meu Carrinho");
    expect(translate("cart.title", "en-US")).toBe("My Cart");
    expect(translate("missing.key", "en-US")).toBe("missing.key");
  });

  it("replaces placeholders in translated strings", () => {
    expect(translate("cart.addedToast", "pt-BR", { name: "X-Burger" })).toBe(
      "X-Burger adicionado ao carrinho!",
    );

    expect(translate("cart.addedToast", "en-US", { name: "X-Burger" })).toBe(
      "X-Burger added to cart!",
    );
  });

  it("handles singular and plural item counts", () => {
    expect(translateItemCount(1, "pt-BR")).toBe("1 item");
    expect(translateItemCount(2, "pt-BR")).toBe("2 itens");
    expect(translateItemCount(1, "en-US")).toBe("1 item");
    expect(translateItemCount(2, "en-US")).toBe("2 items");
  });

  it("localizes entities with translation blocks", () => {
    const entity = {
      name: "Nome em português",
      translations: {
        "en-US": {
          name: "English name",
        },
      },
    };

    expect(getLocalizedEntity(entity, "pt-BR").name).toBe("Nome em português");
    expect(getLocalizedEntity(entity, "en-US").name).toBe("English name");
  });
});
