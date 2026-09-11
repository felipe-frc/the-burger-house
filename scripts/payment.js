import { getMercadoPago } from "./services/mercado-pago-service.js";

import { PAYMENT_METHODS, getSelectedPaymentMethod } from "./payment-methods.js";

import { hidePaymentError, showPaymentError } from "./ui.js";

const CARD_BRICK_CONTAINER_ID = "card-payment-brick-container";

/** @type {any} */
let cardPaymentBrickController = null;

let currentAmount = null;
let currentPaymentMethod = null;
let renderGeneration = 0;

/** @type {((data: any) => Promise<void> | void) | null} */
let paymentSubmitHandler = null;

function getLegacyPaymentForm() {
  return /** @type {HTMLFormElement | null} */ (document.getElementById("form-checkout"));
}

function ensureCardBrickContainer() {
  const existing = document.getElementById(CARD_BRICK_CONTAINER_ID);

  if (existing) {
    existing.classList.remove("hidden");
    return existing;
  }

  const legacyForm = getLegacyPaymentForm();

  if (!legacyForm || !legacyForm.parentElement) {
    throw new Error("O formulário de pagamento não foi encontrado.");
  }

  legacyForm.classList.add("hidden");

  const container = document.createElement("div");

  container.id = CARD_BRICK_CONTAINER_ID;

  container.className = "w-full";

  legacyForm.insertAdjacentElement("afterend", container);

  return container;
}

function getPaymentTypeId(paymentMethod) {
  if (paymentMethod === PAYMENT_METHODS.DEBIT_CARD) {
    return "debit_card";
  }

  if (paymentMethod === PAYMENT_METHODS.CREDIT_CARD) {
    return "credit_card";
  }

  return "";
}

function normalizeBrickCardData(formData, additionalData, paymentMethod) {
  /*
   * IMPORTANTE:
   *
   * O Card Payment Brick pode identificar
   * o cartão Elo de teste como prepaid_card
   * no additionalData.
   *
   * Porém, neste sistema o usuário já
   * escolheu explicitamente Crédito ou
   * Débito antes de preencher o cartão.
   *
   * Portanto o tipo enviado ao backend
   * deve corresponder ao fluxo selecionado,
   * e não à classificação ambígua retornada
   * pelo Brick.
   *
   * O backend também valida isso através
   * do Payment.Method salvo no pagamento.
   */
  const paymentTypeId = getPaymentTypeId(paymentMethod);

  return {
    token: String(formData?.token ?? "").trim(),

    paymentMethodId: String(formData?.payment_method_id ?? "").trim(),

    installments:
      paymentMethod === PAYMENT_METHODS.DEBIT_CARD ? "1" : String(formData?.installments ?? ""),

    cardholderEmail: String(formData?.payer?.email ?? "").trim(),

    identificationType: String(formData?.payer?.identification?.type ?? "").trim(),

    identificationNumber: String(formData?.payer?.identification?.number ?? "").trim(),

    paymentTypeId,

    providerPaymentTypeId: String(additionalData?.paymentTypeId ?? "").trim(),
  };
}

/**
 * @param {number} amount
 * @param {(data: any) => Promise<void> | void} onSubmit
 */
export async function initializePaymentForm(amount, onSubmit) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("O valor do pagamento deve ser maior que zero.");
  }

  if (typeof onSubmit !== "function") {
    throw new TypeError("O callback de pagamento é obrigatório.");
  }

  const paymentMethod = getSelectedPaymentMethod();

  if (
    paymentMethod !== PAYMENT_METHODS.CREDIT_CARD &&
    paymentMethod !== PAYMENT_METHODS.DEBIT_CARD
  ) {
    throw new Error("Selecione crédito ou débito para carregar o formulário do cartão.");
  }

  const normalizedAmount = Number(amount).toFixed(2);

  if (
    cardPaymentBrickController &&
    currentAmount === normalizedAmount &&
    currentPaymentMethod === paymentMethod
  ) {
    paymentSubmitHandler = onSubmit;
    return cardPaymentBrickController;
  }

  unmountPaymentForm();

  paymentSubmitHandler = onSubmit;
  currentAmount = normalizedAmount;
  currentPaymentMethod = paymentMethod;

  const container = ensureCardBrickContainer();

  const mercadoPago = await getMercadoPago();

  const bricksBuilder = /** @type {any} */ (mercadoPago.bricks());

  const generation = ++renderGeneration;

  hidePaymentError();

  const controller = await bricksBuilder.create("cardPayment", CARD_BRICK_CONTAINER_ID, {
    initialization: {
      amount: Number(normalizedAmount),
    },

    callbacks: {
      onReady() {
        hidePaymentError();
      },

      onSubmit(/** @type {any} */ formData, /** @type {any} */ additionalData) {
        if (
          generation !== renderGeneration ||
          currentPaymentMethod !== paymentMethod ||
          getSelectedPaymentMethod() !== paymentMethod
        ) {
          return Promise.reject(
            new Error("Esta instância do formulário de pagamento não está mais ativa."),
          );
        }

        if (!paymentSubmitHandler) {
          return Promise.reject(new Error("O manipulador do pagamento não está disponível."));
        }

        try {
          const cardData = normalizeBrickCardData(formData, additionalData, paymentMethod);

          return Promise.resolve(paymentSubmitHandler(cardData));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível validar os dados retornados pelo Mercado Pago.";

          showPaymentError(message);

          return Promise.reject(error);
        }
      },

      onError(/** @type {any} */ error) {
        if (generation !== renderGeneration) {
          return;
        }

        console.error("Erro no Card Payment Brick:", error);

        showPaymentError("Não foi possível carregar ou validar o formulário de pagamento.");
      },
    },
  });

  if (generation !== renderGeneration) {
    try {
      controller?.unmount?.();
    } catch (error) {
      console.warn("Não foi possível desmontar um Card Payment Brick obsoleto:", error);
    }

    return null;
  }

  cardPaymentBrickController = controller;

  container.classList.remove("hidden");

  return cardPaymentBrickController;
}

export function unmountPaymentForm() {
  renderGeneration++;

  if (cardPaymentBrickController) {
    try {
      cardPaymentBrickController.unmount();
    } catch (error) {
      console.warn("Não foi possível desmontar o Card Payment Brick anterior:", error);
    }
  }

  cardPaymentBrickController = null;
  currentAmount = null;
  currentPaymentMethod = null;
  paymentSubmitHandler = null;

  const container = document.getElementById(CARD_BRICK_CONTAINER_ID);

  if (container) {
    container.innerHTML = "";
  }
}
