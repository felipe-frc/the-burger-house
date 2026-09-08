import { getMercadoPago } from "./services/mercado-pago-service.js";
import { hidePaymentError, showPaymentError } from "./ui.js";

/** @type {any} */
let cardFormInstance = null;

let currentAmount = null;

/** @type {((data: any) => Promise<void> | void) | null} */
let paymentSubmitHandler = null;

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Erro desconhecido no formulário de pagamento.";
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

  const normalizedAmount = Number(amount).toFixed(2);

  paymentSubmitHandler = onSubmit;

  if (cardFormInstance && currentAmount === normalizedAmount) {
    return cardFormInstance;
  }

  if (cardFormInstance) {
    try {
      cardFormInstance.unmount();
    } catch (error) {
      console.warn("Não foi possível desmontar o CardForm anterior:", error);
    }

    cardFormInstance = null;
  }

  const mercadoPago = await getMercadoPago();

  hidePaymentError();

  currentAmount = normalizedAmount;

  cardFormInstance = mercadoPago.cardForm({
    amount: normalizedAmount,

    iframe: true,

    form: {
      id: "form-checkout",

      cardNumber: {
        id: "form-checkout__cardNumber",
        placeholder: "Número do cartão",
      },

      expirationDate: {
        id: "form-checkout__expirationDate",
        placeholder: "MM/AA",
      },

      securityCode: {
        id: "form-checkout__securityCode",
        placeholder: "CVV",
      },

      cardholderName: {
        id: "form-checkout__cardholderName",
        placeholder: "Nome como aparece no cartão",
      },

      issuer: {
        id: "form-checkout__issuer",
        placeholder: "Banco emissor",
      },

      installments: {
        id: "form-checkout__installments",
        placeholder: "Parcelas",
      },

      identificationType: {
        id: "form-checkout__identificationType",
        placeholder: "Tipo de documento",
      },

      identificationNumber: {
        id: "form-checkout__identificationNumber",
        placeholder: "Número do documento",
      },

      cardholderEmail: {
        id: "form-checkout__cardholderEmail",
        placeholder: "E-mail do pagador",
      },
    },

    callbacks: {
      onFormMounted(error) {
        if (!error) {
          return;
        }

        console.error("Erro ao montar o CardForm:", error);

        showPaymentError("Não foi possível carregar o formulário de pagamento.");
      },

      onSubmit(event) {
        event?.preventDefault();

        if (!cardFormInstance || !paymentSubmitHandler) {
          return;
        }

        hidePaymentError();

        const cardData = cardFormInstance.getCardFormData();

        Promise.resolve(paymentSubmitHandler(cardData)).catch((error) => {
          console.error("Erro ao processar pagamento:", error);

          showPaymentError("Não foi possível processar o pagamento. Tente novamente.");
        });
      },

      onError(error) {
        if (!error) {
          return;
        }

        console.warn("Validação do Mercado Pago:", error);
      },
    },
  });

  return cardFormInstance;
}

export function unmountPaymentForm() {
  if (!cardFormInstance) {
    return;
  }

  try {
    cardFormInstance.unmount();
  } catch (error) {
    console.warn("Não foi possível desmontar o CardForm:", error);
  }

  cardFormInstance = null;
  currentAmount = null;
  paymentSubmitHandler = null;
}
