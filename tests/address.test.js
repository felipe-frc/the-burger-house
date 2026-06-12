// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const localStorageMock = (() => {
  let store = {};

  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
})();

vi.stubGlobal("localStorage", localStorageMock);

function setupAddressDom() {
  document.body.innerHTML = `
    <div id="delivery-fields" class="hidden"></div>
    <div id="pickup-info" class="hidden"></div>
    <p id="address-warn" class="hidden"></p>
    <span id="cep-loading" class="hidden"></span>

    <input id="cep" />
    <input id="street" />
    <input id="neighborhood" />
    <input id="city" />
    <input id="house-number" />
    <input id="complement" />

    <input type="radio" id="order-type-delivery" name="order-type" value="delivery" checked />
    <input type="radio" id="order-type-pickup" name="order-type" value="pickup" />
  `;
}

async function loadAddressModule() {
  vi.resetModules();
  return import("../scripts/address.js");
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  localStorage.clear();
  setupAddressDom();
  vi.restoreAllMocks();
});

describe("address", () => {
  it("accepts pickup orders without requiring delivery fields", async () => {
    const address = await loadAddressModule();
    const state = await import("../scripts/state.js");
    const { translate } = await import("../scripts/i18n.js");
    const { STORE_ADDRESS } = await import("../scripts/config.js");

    state.setOrderType(state.ORDER_TYPES.PICKUP);
    address.updateOrderTypeUI();

    expect(address.validateAddressFields()).toBe(true);
    expect(address.getAddressText()).toBe(
      `${translate("address.pickupPrefix")} - ${STORE_ADDRESS}`
    );
    expect(document.getElementById("delivery-fields").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("pickup-info").classList.contains("hidden")).toBe(false);
  });

  it("shows an invalid CEP warning when delivery fields are incomplete", async () => {
    const address = await loadAddressModule();
    const { translate } = await import("../scripts/i18n.js");

    document.getElementById("cep").value = "38400-000";
    document.getElementById("street").value = "Rua dos Testes";
    document.getElementById("neighborhood").value = "";
    document.getElementById("city").value = "Uberlândia";
    document.getElementById("house-number").value = "123";

    expect(address.validateAddressFields()).toBe(false);
    expect(document.getElementById("address-warn").textContent).toBe(
      translate("address.invalidCep")
    );
  });

  it("shows a not found warning for an invalid CEP lookup", async () => {
    const address = await loadAddressModule();
    const { translate } = await import("../scripts/i18n.js");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ erro: true }),
      })
    );

    address.bindAddressEvents();

    const cepInput = document.getElementById("cep");
    cepInput.value = "00000000";
    cepInput.dispatchEvent(new Event("input", { bubbles: true }));

    await flushPromises();

    expect(fetch).toHaveBeenCalledOnce();
    expect(document.getElementById("address-warn").textContent).toBe(
      translate("address.notFound")
    );
    expect(document.getElementById("street").value).toBe("");
    expect(document.getElementById("neighborhood").value).toBe("");
    expect(document.getElementById("city").value).toBe("");
  });

  it("shows a connection error when CEP lookup fails", async () => {
    const address = await loadAddressModule();
    const { translate } = await import("../scripts/i18n.js");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    document.getElementById("street").value = "Rua anterior";
    document.getElementById("neighborhood").value = "Centro";
    document.getElementById("city").value = "Uberlândia";
    document.getElementById("house-number").value = "123";

    address.bindAddressEvents();

    const cepInput = document.getElementById("cep");
    cepInput.value = "38400000";
    cepInput.dispatchEvent(new Event("input", { bubbles: true }));

    await flushPromises();

    expect(fetch).toHaveBeenCalledOnce();
    expect(document.getElementById("address-warn").textContent).toBe(
      translate("address.connectionError")
    );
    expect(document.getElementById("street").value).toBe("");
    expect(document.getElementById("neighborhood").value).toBe("");
    expect(document.getElementById("city").value).toBe("");
    expect(document.getElementById("house-number").value).toBe("");
  });
});
