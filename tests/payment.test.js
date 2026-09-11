// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrick: vi.fn(),
  getMercadoPago: vi.fn(),
  getSelectedPaymentMethod: vi.fn(),
  hidePaymentError: vi.fn(),
  showPaymentError: vi.fn(),
}));

vi.mock("../scripts/services/mercado-pago-service.js", () => ({
  getMercadoPago: mocks.getMercadoPago,
}));

vi.mock("../scripts/payment-methods.js", () => ({
  PAYMENT_METHODS: Object.freeze({
    PIX: 1,
    CREDIT_CARD: 2,
    DEBIT_CARD: 3,
  }),

  getSelectedPaymentMethod: mocks.getSelectedPaymentMethod,
}));

vi.mock("../scripts/ui.js", () => ({
  hidePaymentError: mocks.hidePaymentError,

  showPaymentError: mocks.showPaymentError,
}));

function setupDom() {
  document.body.innerHTML = `
    <div id="payment-wrapper">
      <form id="form-checkout"></form>
    </div>
  `;
}

async function loadPaymentModule() {
  vi.resetModules();

  return import("../scripts/payment.js");
}

beforeEach(() => {
  setupDom();

  mocks.createBrick.mockReset();

  mocks.getMercadoPago.mockReset();

  mocks.getSelectedPaymentMethod.mockReset();

  mocks.hidePaymentError.mockReset();

  mocks.showPaymentError.mockReset();

  mocks.getMercadoPago.mockResolvedValue({
    bricks: () => ({
      create: mocks.createBrick,
    }),
  });
});

describe("Card Payment Brick lifecycle", () => {
  it("renders credit card Brick and forwards normalized Brick data", async () => {
    mocks.getSelectedPaymentMethod.mockReturnValue(2);

    const controller = {
      unmount: vi.fn(),
    };

    let settings;

    mocks.createBrick.mockImplementation(async (_type, _containerId, receivedSettings) => {
      settings = receivedSettings;

      return controller;
    });

    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const payment = await loadPaymentModule();

    await payment.initializePaymentForm(48.9, onSubmit);

    expect(mocks.createBrick).toHaveBeenCalledWith(
      "cardPayment",
      "card-payment-brick-container",
      expect.any(Object),
    );

    expect(settings.initialization.amount).toBe(48.9);

    expect(settings.customization).toBeUndefined();

    await settings.callbacks.onSubmit(
      {
        token: "token-123",

        payment_method_id: "visa",

        installments: 2,

        payer: {
          email: "payer@example.com",

          identification: {
            type: "CPF",

            number: "12345678909",
          },
        },
      },

      {
        paymentTypeId: "credit_card",
      },
    );

    expect(onSubmit).toHaveBeenCalledWith({
      token: "token-123",

      paymentMethodId: "visa",

      installments: "2",

      cardholderEmail: "payer@example.com",

      identificationType: "CPF",

      identificationNumber: "12345678909",

      paymentTypeId: "credit_card",

      providerPaymentTypeId: "credit_card",
    });
  });

  it("renders debit card Brick and forces one installment", async () => {
    mocks.getSelectedPaymentMethod.mockReturnValue(3);

    let settings;

    mocks.createBrick.mockImplementation(async (_type, _containerId, receivedSettings) => {
      settings = receivedSettings;

      return {
        unmount: vi.fn(),
      };
    });

    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const payment = await loadPaymentModule();

    await payment.initializePaymentForm(35, onSubmit);

    expect(settings.customization).toBeUndefined();

    await settings.callbacks.onSubmit(
      {
        token: "token-debit",

        payment_method_id: "elo",

        installments: 7,

        payer: {
          email: "payer@example.com",

          identification: {
            type: "CPF",

            number: "12345678909",
          },
        },
      },

      {
        paymentTypeId: "debit_card",
      },
    );

    expect(onSubmit).toHaveBeenCalledWith({
      token: "token-debit",

      paymentMethodId: "elo",

      installments: "1",

      cardholderEmail: "payer@example.com",

      identificationType: "CPF",

      identificationNumber: "12345678909",

      paymentTypeId: "debit_card",

      providerPaymentTypeId: "debit_card",
    });
  });

  it("rejects callbacks from a Brick that has already been unmounted", async () => {
    mocks.getSelectedPaymentMethod.mockReturnValue(2);

    let settings;

    const controller = {
      unmount: vi.fn(),
    };

    mocks.createBrick.mockImplementation(async (_type, _containerId, receivedSettings) => {
      settings = receivedSettings;

      return controller;
    });

    const payment = await loadPaymentModule();

    await payment.initializePaymentForm(25, vi.fn());

    payment.unmountPaymentForm();

    await expect(
      settings.callbacks.onSubmit(
        {
          token: "old-token",

          payment_method_id: "visa",

          installments: 1,

          payer: {
            email: "old@example.com",

            identification: {
              type: "CPF",

              number: "12345678909",
            },
          },
        },

        {
          paymentTypeId: "credit_card",
        },
      ),
    ).rejects.toThrow("não está mais ativa");

    expect(controller.unmount).toHaveBeenCalledOnce();
  });
});
