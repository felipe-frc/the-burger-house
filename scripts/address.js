import { STORE_ADDRESS } from "./config.js";
import { translate } from "./i18n.js";
import { getOrderType, ORDER_TYPES, setOrderType } from "./state.js";
import { elements, hideAddressWarning, showAddressWarning } from "./ui.js";
import { isValidHouseNumber } from "./utils.js";

let isFetchingCep = false;
let lastFetchedCep = "";

export function getIsFetchingCep() {
  return isFetchingCep;
}

export function isPickupOrder() {
  return getOrderType() === ORDER_TYPES.PICKUP;
}

export function clearAddressFields() {
  if (elements.streetInput) elements.streetInput.value = "";
  if (elements.neighborhoodInput) elements.neighborhoodInput.value = "";
  if (elements.cityInput) elements.cityInput.value = "";
}

export function clearDeliveryFields() {
  clearAddressFields();

  if (elements.houseNumberInput) elements.houseNumberInput.value = "";
  if (elements.complementInput) elements.complementInput.value = "";
}

export function resetAddressForm() {
  if (elements.cepInput) elements.cepInput.value = "";

  clearDeliveryFields();
  hideAddressWarning();
  lastFetchedCep = "";
  updateOrderTypeUI();
}

export function getAddressText() {
  if (isPickupOrder()) {
    return `${translate("address.pickupPrefix")} - ${STORE_ADDRESS}`;
  }

  const street = elements.streetInput ? elements.streetInput.value.trim() : "";
  const houseNumber = elements.houseNumberInput
    ? elements.houseNumberInput.value.trim()
    : "";
  const neighborhood = elements.neighborhoodInput
    ? elements.neighborhoodInput.value.trim()
    : "";
  const city = elements.cityInput ? elements.cityInput.value.trim() : "";
  const complement = elements.complementInput
    ? elements.complementInput.value.trim()
    : "";

  return `${street}, ${houseNumber} - ${neighborhood}, ${city}${
    complement ? ` | ${translate("address.complementPrefix")}: ${complement}` : ""
  }`;
}

export function validateAddressFields() {
  if (isPickupOrder()) {
    hideAddressWarning();
    return true;
  }

  const cep = elements.cepInput ? elements.cepInput.value.replace(/\D/g, "") : "";
  const number = elements.houseNumberInput
    ? elements.houseNumberInput.value.trim()
    : "";
  const street = elements.streetInput ? elements.streetInput.value.trim() : "";
  const neighborhood = elements.neighborhoodInput
    ? elements.neighborhoodInput.value.trim()
    : "";
  const city = elements.cityInput ? elements.cityInput.value.trim() : "";

  if (isFetchingCep) {
    showAddressWarning(translate("address.waitCep"));
    return false;
  }

  if (cep.length !== 8 || street === "" || neighborhood === "" || city === "") {
    showAddressWarning(
      translate("address.invalidCep")
    );
    return false;
  }

  if (!isValidHouseNumber(number)) {
    showAddressWarning(translate("address.invalidNumber"));
    return false;
  }

  hideAddressWarning();
  return true;
}

export function updateOrderTypeUI() {
  const orderType = getOrderType();
  const isPickup = orderType === ORDER_TYPES.PICKUP;

  if (elements.orderTypeInputs) {
    elements.orderTypeInputs.forEach((input) => {
      input.checked = input.value === orderType;
    });
  }

  if (elements.deliveryFields) {
    elements.deliveryFields.classList.toggle("hidden", isPickup);
    elements.deliveryFields.setAttribute("aria-hidden", String(isPickup));
  }

  if (elements.pickupInfo) {
    elements.pickupInfo.classList.toggle("hidden", !isPickup);
  }

  if (isPickup) {
    hideAddressWarning();
  }
}

async function fetchAddressByCep() {
  if (!elements.cepInput || isPickupOrder()) return;

  const cep = elements.cepInput.value.replace(/\D/g, "");

  if (cep.length !== 8) {
    clearDeliveryFields();
    hideAddressWarning();
    lastFetchedCep = "";
    return;
  }

  if (cep === lastFetchedCep) return;

  try {
    isFetchingCep = true;
    lastFetchedCep = cep;

    if (elements.cepLoading) {
      elements.cepLoading.classList.remove("hidden");
    }

    hideAddressWarning();

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);

    if (!response.ok) {
      throw new Error(translate("address.fetchFailed"));
    }

    const data = await response.json();

    if (data.erro) {
      clearDeliveryFields();
      lastFetchedCep = "";
      showAddressWarning(translate("address.notFound"));
      return;
    }

    const street = data.logradouro || "";
    const neighborhood = data.bairro || "";
    const city = data.localidade || "";

    if (elements.streetInput) elements.streetInput.value = street;
    if (elements.neighborhoodInput) elements.neighborhoodInput.value = neighborhood;
    if (elements.cityInput) elements.cityInput.value = city;

    if (!street || !neighborhood || !city) {
      clearAddressFields();
      showAddressWarning(
        translate("address.incompleteCep")
      );
      return;
    }

    hideAddressWarning();
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);

    clearDeliveryFields();
    lastFetchedCep = "";
    showAddressWarning(
      translate("address.connectionError")
    );
  } finally {
    isFetchingCep = false;

    if (elements.cepLoading) {
      elements.cepLoading.classList.add("hidden");
    }
  }
}

export function bindAddressEvents() {
  updateOrderTypeUI();

  if (elements.orderTypeInputs) {
    elements.orderTypeInputs.forEach((input) => {
      input.addEventListener("change", () => {
        setOrderType(input.value);
        updateOrderTypeUI();
      });
    });
  }

  if (elements.cepInput) {
    elements.cepInput.addEventListener("input", () => {
      elements.cepInput.value = elements.cepInput.value
        .replace(/\D/g, "")
        .replace(/^(\d{5})(\d)/, "$1-$2")
        .slice(0, 9);

      const cep = elements.cepInput.value.replace(/\D/g, "");

      if (cep.length < 8) {
        clearDeliveryFields();
        hideAddressWarning();
        lastFetchedCep = "";

        if (elements.cepLoading) {
          elements.cepLoading.classList.add("hidden");
        }

        return;
      }

      if (cep.length === 8) {
        fetchAddressByCep();
      }
    });
  }

  if (elements.houseNumberInput) {
    elements.houseNumberInput.addEventListener("input", () => {
      elements.houseNumberInput.value = elements.houseNumberInput.value.replace(
        /\D/g,
        ""
      );
      hideAddressWarning();
    });
  }

  if (elements.complementInput) {
    elements.complementInput.addEventListener("input", hideAddressWarning);
  }
}
