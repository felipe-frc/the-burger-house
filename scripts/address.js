import { elements, hideAddressWarning, showAddressWarning } from "./ui.js";
import { isValidHouseNumber } from "./utils.js";

let isFetchingCep = false;
let lastFetchedCep = "";

export function getIsFetchingCep() {
  return isFetchingCep;
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
}

export function getAddressText() {
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
    complement ? ` | Complemento: ${complement}` : ""
  }`;
}

export function validateAddressFields() {
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
    showAddressWarning("Aguarde a busca do CEP terminar.");
    return false;
  }

  if (cep.length !== 8 || street === "" || neighborhood === "" || city === "") {
    showAddressWarning(
      "Preencha os campos obrigatórios e informe um CEP válido para carregar o endereço."
    );
    return false;
  }

  if (!isValidHouseNumber(number)) {
    showAddressWarning("Informe um número válido usando apenas dígitos.");
    return false;
  }

  hideAddressWarning();
  return true;
}

async function fetchAddressByCep() {
  if (!elements.cepInput) return;

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
      throw new Error("Falha ao consultar o CEP.");
    }

    const data = await response.json();

    if (data.erro) {
      clearDeliveryFields();
      lastFetchedCep = "";
      showAddressWarning("CEP não encontrado. Verifique o número informado.");
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
        "Não foi possível preencher o endereço completo com esse CEP."
      );
      return;
    }

    hideAddressWarning();
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);

    clearDeliveryFields();
    lastFetchedCep = "";
    showAddressWarning(
      "Erro ao buscar o CEP. Verifique sua conexão e tente novamente."
    );
  } finally {
    isFetchingCep = false;

    if (elements.cepLoading) {
      elements.cepLoading.classList.add("hidden");
    }
  }
}

export function bindAddressEvents() {
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