// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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
  it("translates the real hero hours immediately when switching language", () => {
    document.body.innerHTML = readFileSync("index.html", "utf8");
    applyStaticTranslations("pt-BR");
    bindLanguageSwitcher();
    const hours = document.querySelector('[data-i18n="hero.hours"]');
    expect(hours.textContent).toBe("Segunda a domingo • 18h às 23h");
    const select = document.getElementById("language-select");
    select.value = "en-US";
    select.dispatchEvent(new Event("change"));
    expect(hours.textContent).toBe("Monday to Sunday • 6 PM to 11 PM");
    select.value = "pt-BR";
    select.dispatchEvent(new Event("change"));
    expect(hours.textContent).toBe("Segunda a domingo • 18h às 23h");
    localStorage.clear();
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
