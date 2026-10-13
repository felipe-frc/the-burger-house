// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bindAddressEvents: vi.fn(),
  updateOrderTypeUI: vi.fn(),

  bindAddToCartButtons: vi.fn(),
  bindCartControls: vi.fn(),
  updateCart: vi.fn(),

  applyStaticTranslations: vi.fn(),
  bindLanguageSwitcher: vi.fn(),
  getCurrentLanguage: vi.fn(() => "pt-BR"),

  bindOrderEvents: vi.fn(),

  bindModalCloseEvents: vi.fn(),
  hideCartFooter: vi.fn(),
  renderMenu: vi.fn(),
  revealOnScroll: vi.fn(),
  setupCartVisibility: vi.fn(),
  setupCategoryNavigation: vi.fn(),
  updateStoreStatus: vi.fn(),

  getPublicProducts: vi.fn(async () => []),
  applyPublicCatalog: vi.fn(),
  getCart: vi.fn(() => []),
  setCart: vi.fn(),
  reconcileCartWithCatalog: vi.fn(() => []),

  languageChangeCallback: null,
}));

vi.mock("../scripts/api.js", () => ({
  getPublicProducts: mocks.getPublicProducts,
}));

vi.mock("../scripts/data.js", () => ({
  applyPublicCatalog: mocks.applyPublicCatalog,
}));

vi.mock("../scripts/state.js", () => ({
  getCart: mocks.getCart,
  setCart: mocks.setCart,
}));

vi.mock("../scripts/cart-service.js", () => ({
  reconcileCartWithCatalog: mocks.reconcileCartWithCatalog,
}));
vi.mock("../scripts/address.js", () => ({
  bindAddressEvents: mocks.bindAddressEvents,
  updateOrderTypeUI: mocks.updateOrderTypeUI,
}));

vi.mock("../scripts/cart.js", () => ({
  bindAddToCartButtons: mocks.bindAddToCartButtons,
  bindCartControls: mocks.bindCartControls,
  updateCart: mocks.updateCart,
}));

vi.mock("../scripts/i18n.js", () => ({
  applyStaticTranslations: mocks.applyStaticTranslations,

  bindLanguageSwitcher: vi.fn((callback) => {
    mocks.bindLanguageSwitcher(callback);
    mocks.languageChangeCallback = callback;
  }),

  getCurrentLanguage: mocks.getCurrentLanguage,
}));

vi.mock("../scripts/order.js", () => ({
  bindOrderEvents: mocks.bindOrderEvents,
}));

vi.mock("../scripts/ui.js", () => ({
  bindModalCloseEvents: mocks.bindModalCloseEvents,
  hideCartFooter: mocks.hideCartFooter,
  renderMenu: mocks.renderMenu,
  revealOnScroll: mocks.revealOnScroll,
  setupCartVisibility: mocks.setupCartVisibility,
  setupCategoryNavigation: mocks.setupCategoryNavigation,
  updateStoreStatus: mocks.updateStoreStatus,
}));

async function loadMainModule() {
  vi.resetModules();

  return import("../scripts/main.js");
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.languageChangeCallback = null;
  mocks.getCurrentLanguage.mockReturnValue("pt-BR");
});

describe("main", () => {
  it("initializes the application and refreshes localized UI", async () => {
    await loadMainModule();

    document.dispatchEvent(new Event("DOMContentLoaded"));

    await vi.waitFor(() => {
      expect(mocks.renderMenu).toHaveBeenCalledOnce();
    });

    expect(mocks.getPublicProducts).toHaveBeenCalledOnce();
    expect(mocks.applyPublicCatalog).toHaveBeenCalledWith([]);
    expect(mocks.reconcileCartWithCatalog).toHaveBeenCalledWith([], []);
    expect(mocks.setCart).toHaveBeenCalledWith([]);

    expect(mocks.getCurrentLanguage).toHaveBeenCalledOnce();

    expect(mocks.applyStaticTranslations).toHaveBeenCalledWith("pt-BR");

    expect(mocks.renderMenu).toHaveBeenCalledOnce();

    expect(mocks.hideCartFooter).toHaveBeenCalledOnce();

    expect(mocks.bindModalCloseEvents).toHaveBeenCalledOnce();

    expect(mocks.bindAddToCartButtons).toHaveBeenCalledOnce();

    expect(mocks.bindCartControls).toHaveBeenCalledOnce();

    expect(mocks.bindAddressEvents).toHaveBeenCalledOnce();

    expect(mocks.bindOrderEvents).toHaveBeenCalledOnce();

    expect(mocks.bindLanguageSwitcher).toHaveBeenCalledOnce();

    expect(mocks.updateCart).toHaveBeenCalledOnce();

    expect(mocks.updateStoreStatus).toHaveBeenCalledOnce();

    expect(mocks.setupCartVisibility).toHaveBeenCalledOnce();

    expect(mocks.setupCategoryNavigation).toHaveBeenCalledOnce();

    expect(mocks.revealOnScroll).toHaveBeenCalledOnce();

    expect(mocks.languageChangeCallback).toEqual(expect.any(Function));

    mocks.languageChangeCallback();

    expect(mocks.renderMenu).toHaveBeenCalledTimes(2);

    expect(mocks.updateCart).toHaveBeenCalledTimes(2);

    expect(mocks.updateStoreStatus).toHaveBeenCalledTimes(2);

    expect(mocks.updateOrderTypeUI).toHaveBeenCalledOnce();

    expect(mocks.setupCategoryNavigation).toHaveBeenCalledTimes(2);

    expect(mocks.revealOnScroll).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("scroll"));

    expect(mocks.revealOnScroll).toHaveBeenCalledTimes(3);
  });
});
