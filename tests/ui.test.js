// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

function setupUiDom() {
  document.body.innerHTML = `
    <button id="trigger">Abrir</button>

    <div id="cart-modal" class="hidden">
      <button class="close-modal-x" id="cart-first">Primeiro</button>
      <button id="cart-last">Último</button>
    </div>

    <div id="address-modal" class="hidden">
      <button class="close-modal-x">Fechar</button>
    </div>

    <div id="review-modal" class="hidden">
      <button class="close-modal-x">Fechar</button>
    </div>

    <div id="menu-categories"></div>
    <div id="delivery-fields"></div>
    <div id="pickup-info"></div>
    <div id="date-span"></div>
    <div id="status-text"></div>
  `;
}

async function loadUiModule() {
  vi.resetModules();
  return import("../scripts/ui.js");
}

beforeEach(() => {
  setupUiDom();
  vi.restoreAllMocks();

  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });

  vi.stubGlobal("requestAnimationFrame", (callback) => {
    callback();
    return 1;
  });
});

describe("ui modals", () => {
  it("opens a modal, removes the hidden class and focuses the first control", async () => {
    const ui = await loadUiModule();
    const trigger = document.getElementById("trigger");
    const cartModal = document.getElementById("cart-modal");
    const firstButton = document.getElementById("cart-first");

    trigger.focus();
    ui.openModal(cartModal);

    expect(cartModal.classList.contains("hidden")).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(firstButton);
  });

  it("closes the active modal with Escape and restores focus", async () => {
    const ui = await loadUiModule();
    const trigger = document.getElementById("trigger");
    const cartModal = document.getElementById("cart-modal");

    ui.bindModalCloseEvents();

    trigger.focus();
    ui.openModal(cartModal);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(cartModal.classList.contains("hidden")).toBe(true);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("traps keyboard navigation inside the active modal", async () => {
    const ui = await loadUiModule();
    const cartModal = document.getElementById("cart-modal");
    const firstButton = document.getElementById("cart-first");
    const lastButton = document.getElementById("cart-last");

    ui.bindModalCloseEvents();
    ui.openModal(cartModal);

    lastButton.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(document.activeElement).toBe(firstButton);
  });
});
