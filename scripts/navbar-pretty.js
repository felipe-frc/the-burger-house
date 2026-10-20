import { applyStaticTranslations, getCurrentLanguage } from "./i18n.js";
(function () {
  "use strict";

  function initPrettyNavbar() {
    if (document.querySelector(".bh-pretty-nav")) return;

    const hero = document.querySelector("body > header");
    const language = document.getElementById("language-select");
    const cart = document.querySelector(".cart-button");

    if (!hero || !language || !cart) {
      console.error("Navbar: elementos originais nao encontrados.");
      return;
    }

    const nav = document.createElement("nav");

    nav.className = "bh-pretty-nav";
    nav.setAttribute("aria-label", "Navegação principal");

    nav.innerHTML = `
      <div class="bh-pretty-nav-links">
        <a href="#menu" data-i18n="prettyNav.about">SOBRE</a>
        <a href="#menu" data-i18n="prettyNav.menu">CARDÁPIO</a>
        <a href="#menu" data-i18n="prettyNav.contact">CONTATO</a>
      </div>

      <a
        class="bh-pretty-nav-brand"
        href="#"
        aria-label="The Burger House - Início" data-i18n-aria-label="prettyNav.brandAria"
      >
        <img
          src="/assets/branding/logo-burger-house.png"
          alt="The Burger House"
          width="220"
        >
      </a>

      <div class="bh-pretty-nav-actions">
        <div class="bh-pretty-nav-language">
          <div class="bh-pretty-flags" role="group" aria-label="Idioma" data-i18n-aria-label="language.label">
  <button type="button" class="bh-pretty-flag" data-lang="pt-BR" aria-label="Português">
    <img src="/assets/branding/flags/br.svg" alt="">
    <span>PT</span>
  </button>
  <button type="button" class="bh-pretty-flag" data-lang="en-US" aria-label="English">
    <img src="/assets/branding/flags/us.svg" alt="">
    <span>EN</span>
  </button>
</div>
          <span class="bh-pretty-language-slot"></span>
        </div>

        <button
          type="button"
          class="bh-pretty-nav-action bh-pretty-nav-action--delivery"
          data-pretty-delivery
        >
          <span data-i18n="prettyNav.delivery">PEDIR DELIVERY</span>
        </button>

        <button
          type="button"
          class="bh-pretty-nav-action bh-pretty-nav-action--primary bh-pretty-cart"
          data-pretty-cart
          aria-label="Abrir meu carrinho"
        >
          <svg xmlns="http://www.w3.org/2000/svg"
               width="25" height="25" viewBox="0 0 24 24"
               fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <span class="bh-pretty-cart-count" aria-hidden="true">0</span>
        </button>
      </div>
    `;

    hero.before(nav);

    const originalLanguageWrapper = language.parentElement;
    const slot = nav.querySelector(".bh-pretty-language-slot");

    if (slot) {
      slot.replaceWith(language);
      language.className = "bh-pretty-native-select";
      language.tabIndex = -1;

      const flagButtons = nav.querySelectorAll(".bh-pretty-flag");

      language.value = getCurrentLanguage();

      const syncFlags = () => {
        const en = language.value === "en-US";

        // Corrige explicitamente o atributo que falhou no Playwright.
        nav.setAttribute(
          "aria-label",
          en ? "Main navigation" : "Navegação principal"
        );

        flagButtons.forEach((button) => {
          const active = button.dataset.lang === language.value;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
      };

      flagButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (language.value !== button.dataset.lang) {
            language.value = button.dataset.lang;
            localStorage.setItem("burgerShop:language", language.value);
            language.dispatchEvent(new Event("change", { bubbles: true }));
          }
          applyStaticTranslations(language.value);
          syncFlags();
        });
      });

      language.addEventListener("change", () => {
        applyStaticTranslations(language.value);
        syncFlags();
      });

      applyStaticTranslations(language.value);
      syncFlags();
    }

    if (originalLanguageWrapper) {
      const originalFloatingContainer =
        originalLanguageWrapper.parentElement;

      if (
        originalFloatingContainer &&
        originalFloatingContainer !== nav
      ) {
        originalFloatingContainer.style.display = "none";
      }
    }

    nav
      .querySelector("[data-pretty-cart]")
      ?.addEventListener("click", () => {
        cart.click();
      });

    // Espelha o contador original sem alterar a logica do carrinho.
    const originalCount = document.getElementById("cart-count");
    const visualCount = nav.querySelector(".bh-pretty-cart-count");
    const navCart = nav.querySelector("[data-pretty-cart]");

    if (originalCount && visualCount && navCart) {
      const syncCartCount = () => {
        const quantity = Number.parseInt(originalCount.textContent || "0", 10);
        const count = Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;

        visualCount.textContent = count > 99 ? "99+" : String(count);
        visualCount.hidden = count === 0;
        const en = language.value === "en-US";
        const label = count === 0
          ? (en ? "Open my cart, empty" : "Abrir meu carrinho, vazio")
          : en
            ? `Open my cart, ${count} ${count === 1 ? "item" : "items"}`
            : `Abrir meu carrinho, ${count} ${count === 1 ? "item" : "itens"}`;

        navCart.setAttribute("aria-label", label);
      };

      new MutationObserver(syncCartCount).observe(originalCount, {
        childList: true,
        characterData: true,
        subtree: true
      });

      language.addEventListener("change", syncCartCount);
      syncCartCount();
    }
    nav
      .querySelector("[data-pretty-delivery]")
      ?.addEventListener("click", () => {
        document.getElementById("menu")?.scrollIntoView({
          behavior: "smooth"
        });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initPrettyNavbar,
      { once: true }
    );
  } else {
    initPrettyNavbar();
  }
})();