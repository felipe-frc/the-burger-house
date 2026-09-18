// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  isStoreOpen: true,
}));

vi.mock("../scripts/config.js", () => ({
  TOAST_DURATION_MS: 3000,
}));

vi.mock("../scripts/data.js", () => ({
  MENU_CATEGORIES: [
    {
      id: "menu",
      icon: "fa fa-burger",
      title: "Hambúrgueres",
      subtitle: "Escolha seu favorito",
      items: [
        {
          id: "burger-1",
          name: "Burger Clássico",
          description: "Pão, carne e queijo",
          image: "assets/burger.jpg",
          imageAlt: "Burger Clássico",
          price: 25,
          tag: "Mais vendido",
        },
      ],
    },
    {
      id: "sides",
      icon: "fa fa-utensils",
      title: "Acompanhamentos",
      subtitle: "Para completar",
      items: [],
    },
    {
      id: "drinks",
      icon: "fa fa-glass",
      title: "Bebidas",
      subtitle: "Para refrescar",
      items: [],
    },
  ],
}));

vi.mock("../scripts/i18n.js", () => ({
  getLocalizedEntity: (entity) => ({
    ...entity,
  }),

  translate: (key, _locale, params = {}) => {
    const translations = {
      "status.open": "Aberto agora",
      "status.closed": "Fechado agora",
      "status.closedMessage": "A loja está fechada",
      "order.sending": "Enviando...",
    };

    if (key === "cart.addAria") {
      return `Adicionar ${params.name}`;
    }

    return translations[key] ?? key;
  },
}));

vi.mock("../scripts/utils.js", () => ({
  escapeHTML: (value) => String(value),

  formatPrice: (value) => `R$ ${Number(value).toFixed(2).replace(".", ",")}`,

  isStoreOpenNow: () => runtimeMock.isStoreOpen,
}));

function setupUiDom() {
  document.body.innerHTML = `
    <div id="menu-categories"></div>

    <div id="cart-modal" class="hidden"></div>
    <div id="address-modal" class="hidden"></div>
    <div id="review-modal" class="hidden"></div>

    <button id="cart-btn"></button>

    <footer
      class="cart-footer cart-footer-hidden"
    ></footer>

    <button id="close-modal-btn"></button>
    <button id="go-to-address-btn"></button>
    <button id="back-to-cart-btn"></button>
    <button id="go-to-review-btn"></button>
    <button id="back-to-address-btn"></button>


    <div id="cart-items"></div>
    <span id="cart-total"></span>
    <span id="cart-count"></span>

    <input id="cep" />
    <input id="street" />
    <input id="neighborhood" />
    <input id="city" />
    <input id="house-number" />
    <input id="complement" />

    <p id="address-warn" class="hidden"></p>
    <span id="cep-loading" class="hidden"></span>

    <div id="review-items"></div>
    <div id="review-address"></div>
    <div id="review-total"></div>
    <textarea id="order-notes"></textarea>

    <input
      type="radio"
      name="order-type"
      value="delivery"
    />

    <div id="delivery-fields"></div>
    <div id="pickup-info"></div>

    <div
      id="date-span"
      class="text-white badge-open"
    ></div>

    <span id="status-text"></span>

    <nav id="category-nav">
      <a
        href="#menu"
        data-category-link="menu"
        class="active"
      >
        Hambúrgueres
      </a>

      <a
        href="#sides"
        data-category-link="sides"
      >
        Acompanhamentos
      </a>

      <a
        href="#drinks"
        data-category-link="drinks"
      >
        Bebidas
      </a>
    </nav>
  `;
}

async function loadUiModule() {
  vi.resetModules();

  return import("../scripts/ui.js");
}

function setWindowScrollY(value) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value,
  });
}

function configurePageDimensions({ innerHeight = 800, scrollHeight = 2400 } = {}) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: innerHeight,
  });

  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
}

function configureCategoryGeometry() {
  const nav = document.getElementById("category-nav");
  const menu = document.getElementById("menu");
  const sides = document.getElementById("sides");
  const drinks = document.getElementById("drinks");

  Object.defineProperty(nav, "offsetHeight", {
    configurable: true,
    value: 80,
  });

  Object.defineProperty(nav, "offsetTop", {
    configurable: true,
    value: 500,
  });

  Object.defineProperty(menu, "offsetTop", {
    configurable: true,
    value: 500,
  });

  Object.defineProperty(sides, "offsetTop", {
    configurable: true,
    value: 1000,
  });

  Object.defineProperty(drinks, "offsetTop", {
    configurable: true,
    value: 1500,
  });

  menu.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    bottom: 500,
    left: 0,
    right: 0,
    width: 100,
    height: 400,
    x: 0,
    y: 100,
    toJSON() {},
  }));

  sides.getBoundingClientRect = vi.fn(() => ({
    top: 700,
    bottom: 1100,
    left: 0,
    right: 0,
    width: 100,
    height: 400,
    x: 0,
    y: 700,
    toJSON() {},
  }));

  drinks.getBoundingClientRect = vi.fn(() => ({
    top: 1300,
    bottom: 1700,
    left: 0,
    right: 0,
    width: 100,
    height: 400,
    x: 0,
    y: 1300,
    toJSON() {},
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();

  runtimeMock.isStoreOpen = true;

  setupUiDom();

  configurePageDimensions();
  setWindowScrollY(0);

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      callback();
      return 1;
    }),
  );

  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

describe("ui extended behavior", () => {
  it("logs an error when Toastify is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const ui = await loadUiModule();

    ui.showToast("Mensagem de teste");

    expect(consoleError).toHaveBeenCalledWith("Toastify não carregado:", "Mensagem de teste");

    consoleError.mockRestore();
  });

  it("configures and displays a Toastify notification", async () => {
    const showToast = vi.fn();
    const toastify = vi.fn(() => ({
      showToast,
    }));

    vi.stubGlobal("Toastify", toastify);

    const ui = await loadUiModule();

    ui.showToast("Pedido adicionado", "#16a34a");

    expect(toastify).toHaveBeenCalledWith({
      text: "Pedido adicionado",
      duration: 3000,
      gravity: "top",
      position: "right",
      stopOnFocus: true,
      style: {
        background: "#16a34a",
        color: "#ffffff",
        borderRadius: "10px",
      },
    });

    expect(showToast).toHaveBeenCalledOnce();

    ui.showClosedStoreMessage();

    expect(toastify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "A loja está fechada",
      }),
    );
  });

  it("shows and hides address warnings", async () => {
    const ui = await loadUiModule();

    const warning = document.getElementById("address-warn");

    ui.showAddressWarning("CEP inválido");

    expect(warning.textContent).toBe("CEP inválido");

    expect(warning.classList.contains("hidden")).toBe(false);

    ui.hideAddressWarning();

    expect(warning.classList.contains("hidden")).toBe(true);
  });

  it("renders menu categories and product cards", async () => {
    const ui = await loadUiModule();

    ui.renderMenu();

    const menu = document.getElementById("menu");
    const sides = document.getElementById("sides");
    const drinks = document.getElementById("drinks");

    expect(menu).not.toBeNull();
    expect(sides).not.toBeNull();
    expect(drinks).not.toBeNull();

    expect(document.querySelector(".product-item-name").textContent).toBe("Burger Clássico");

    expect(document.querySelector(".product-item-desc").textContent).toBe("Pão, carne e queijo");

    expect(document.querySelector(".product-item-price").textContent).toBe("R$ 25,00");

    expect(document.querySelector(".product-item-tag").textContent).toBe("Mais vendido");

    const image = document.querySelector(".product-item-img");

    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");

    const addButton = document.querySelector(".add-to-cart-btn");

    expect(addButton.dataset.id).toBe("burger-1");

    expect(addButton.getAttribute("aria-label")).toBe("Adicionar Burger Clássico");
  });

  it("updates store status for open and closed states", async () => {
    const ui = await loadUiModule();

    const dateSpan = document.getElementById("date-span");

    const statusText = document.getElementById("status-text");

    runtimeMock.isStoreOpen = true;

    ui.updateStoreStatus();

    expect(statusText.textContent).toBe("Aberto agora");

    expect(dateSpan.classList.contains("text-emerald-400")).toBe(true);

    runtimeMock.isStoreOpen = false;

    ui.updateStoreStatus();

    expect(statusText.textContent).toBe("Fechado agora");

    expect(dateSpan.classList.contains("text-rose-400")).toBe(true);

    expect(dateSpan.classList.contains("text-emerald-400")).toBe(false);
  });

  it("reveals product cards when they enter the viewport", async () => {
    const ui = await loadUiModule();

    ui.renderMenu();

    const card = document.querySelector(".product-item-card");

    card.getBoundingClientRect = vi.fn(() => ({
      top: 300,
      bottom: 500,
      left: 0,
      right: 0,
      width: 100,
      height: 200,
      x: 0,
      y: 300,
      toJSON() {},
    }));

    ui.revealOnScroll();

    expect(card.classList.contains("active")).toBe(true);

    card.classList.remove("active");

    card.getBoundingClientRect = vi.fn(() => ({
      top: 1000,
      bottom: 1200,
      left: 0,
      right: 0,
      width: 100,
      height: 200,
      x: 0,
      y: 1000,
      toJSON() {},
    }));

    ui.revealOnScroll();

    expect(card.classList.contains("active")).toBe(false);
  });

  it("changes cart footer visibility according to page position", async () => {
    const ui = await loadUiModule();

    ui.renderMenu();

    configureCategoryGeometry();

    const footer = document.querySelector(".cart-footer");

    setWindowScrollY(0);

    ui.setupCartVisibility();

    expect(footer.classList.contains("cart-footer-hidden")).toBe(true);

    setWindowScrollY(600);

    window.dispatchEvent(new Event("scroll"));

    expect(footer.classList.contains("cart-footer-visible")).toBe(true);

    expect(footer.classList.contains("cart-footer-bottom")).toBe(false);

    setWindowScrollY(1700);

    window.dispatchEvent(new Event("scroll"));

    expect(footer.classList.contains("cart-footer-visible")).toBe(true);

    expect(footer.classList.contains("cart-footer-bottom")).toBe(true);

    ui.hideCartFooter();

    expect(footer.classList.contains("cart-footer-hidden")).toBe(true);
  });

  it("updates category navigation on scroll and click", async () => {
    vi.useFakeTimers();

    const scrollTo = vi.fn();

    vi.stubGlobal("scrollTo", scrollTo);

    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback();
        return 1;
      });

    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});

    const ui = await loadUiModule();

    ui.renderMenu();

    configureCategoryGeometry();

    const menuLink = document.querySelector("[data-category-link='menu']");

    const sidesLink = document.querySelector("[data-category-link='sides']");

    const drinksLink = document.querySelector("[data-category-link='drinks']");

    ui.setupCategoryNavigation();

    expect(menuLink.classList.contains("active")).toBe(true);

    sidesLink.click();

    expect(sidesLink.classList.contains("active")).toBe(true);

    expect(sidesLink.getAttribute("aria-current")).toBe("true");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 896,
      behavior: "smooth",
    });

    await vi.advanceTimersByTimeAsync(900);

    setWindowScrollY(1700);

    window.dispatchEvent(new Event("scroll"));

    expect(drinksLink.classList.contains("active")).toBe(true);

    expect(drinksLink.getAttribute("aria-current")).toBe("true");

    expect(sidesLink.hasAttribute("aria-current")).toBe(false);

    ui.setupCategoryNavigation();

    sidesLink.click();

    expect(scrollTo).toHaveBeenCalledTimes(2);

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });
});
