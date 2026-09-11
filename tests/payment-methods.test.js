// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

function setupDom() {
  document.body.innerHTML = `
    <div id="payment-modal">
      <p class="cart-modal-subtitle">
        Pagamento
      </p>

      <div
        class="payment-security"
      >
        <i class="fa fa-lock"></i>

        <p>
          Pagamento seguro
        </p>
      </div>

      <form
        id="form-checkout"
      ></form>

      <div
        id="card-payment-brick-container"
      ></div>

      <button
        id="form-checkout__submit"
        type="submit"
        form="form-checkout"
      >
        Pagar agora
      </button>
    </div>
  `;
}

async function loadModule() {
  vi.resetModules();

  return import("../scripts/payment-methods.js");
}

beforeEach(() => {
  setupDom();

  vi.restoreAllMocks();
});

describe("payment methods UI", () => {
  it("starts with credit card selected", async () => {
    const paymentMethods = await loadModule();

    paymentMethods.configurePaymentMethodUI({
      onMethodChange: vi.fn(),

      onPixSubmit: vi.fn(),
    });

    expect(paymentMethods.getSelectedPaymentMethod()).toBe(
      paymentMethods.PAYMENT_METHODS.CREDIT_CARD,
    );

    const creditInput = document.querySelector("input[name='payment-method'][value='2']");

    expect(creditInput.checked).toBe(true);

    expect(document.getElementById("form-checkout").classList.contains("hidden")).toBe(true);

    expect(
      document.getElementById("card-payment-brick-container").classList.contains("hidden"),
    ).toBe(false);

    expect(document.getElementById("pix-payment-panel").classList.contains("hidden")).toBe(true);

    const legacySubmitButton = document.getElementById("form-checkout__submit");

    expect(legacySubmitButton.classList.contains("hidden")).toBe(true);

    expect(legacySubmitButton.disabled).toBe(true);
  });

  it("shows Pix UI and hides the card brick", async () => {
    const onMethodChange = vi.fn();

    const onPixSubmit = vi.fn();

    const paymentMethods = await loadModule();

    paymentMethods.configurePaymentMethodUI({
      onMethodChange,
      onPixSubmit,
    });

    const pixInput = document.querySelector("input[name='payment-method'][value='1']");

    pixInput.checked = true;

    pixInput.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    expect(paymentMethods.getSelectedPaymentMethod()).toBe(paymentMethods.PAYMENT_METHODS.PIX);

    expect(
      document.getElementById("card-payment-brick-container").classList.contains("hidden"),
    ).toBe(true);

    expect(document.getElementById("pix-payment-panel").classList.contains("hidden")).toBe(false);

    const button = document.getElementById("generate-pix-btn");

    expect(button.type).toBe("button");

    expect(button.textContent).toContain("Gerar PIX");

    button.click();

    expect(onPixSubmit).toHaveBeenCalledOnce();

    expect(onMethodChange).toHaveBeenCalledWith(1);
  });

  it("shows debit card through the card brick", async () => {
    const onMethodChange = vi.fn();

    const paymentMethods = await loadModule();

    paymentMethods.configurePaymentMethodUI({
      onMethodChange,

      onPixSubmit: vi.fn(),
    });

    const debitInput = document.querySelector("input[name='payment-method'][value='3']");

    debitInput.checked = true;

    debitInput.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    expect(paymentMethods.getSelectedPaymentMethod()).toBe(
      paymentMethods.PAYMENT_METHODS.DEBIT_CARD,
    );

    expect(
      document.getElementById("card-payment-brick-container").classList.contains("hidden"),
    ).toBe(false);

    expect(document.getElementById("pix-payment-panel").classList.contains("hidden")).toBe(true);

    expect(onMethodChange).toHaveBeenCalledWith(3);
  });

  it("renders Pix QR code and copy-and-paste code", async () => {
    const paymentMethods = await loadModule();

    paymentMethods.configurePaymentMethodUI({
      onMethodChange: vi.fn(),

      onPixSubmit: vi.fn(),
    });

    paymentMethods.setPixInstructions({
      qrCode: "000201PIXCODE",

      qrCodeBase64: "ABC123",

      ticketUrl: "https://www.mercadopago.com.br/pix/test",
    });

    const instructions = document.getElementById("pix-instructions");

    const image = document.getElementById("pix-qr-image");

    const code = document.getElementById("pix-copy-code");

    const ticket = document.getElementById("pix-ticket-url");

    expect(instructions.classList.contains("hidden")).toBe(false);

    expect(code.value).toBe("000201PIXCODE");

    expect(image.src).toContain("data:image/png;base64,ABC123");

    expect(image.classList.contains("hidden")).toBe(false);

    expect(ticket.href).toContain("mercadopago.com.br");

    expect(ticket.classList.contains("hidden")).toBe(false);
  });

  it("locks payment method and Pix controls after a payment attempt begins", async () => {
    const paymentMethods = await loadModule();

    paymentMethods.configurePaymentMethodUI({
      onMethodChange: vi.fn(),

      onPixSubmit: vi.fn(),
    });

    paymentMethods.setPaymentMethodLocked(true);

    const inputs = document.querySelectorAll("input[name='payment-method']");

    expect(inputs).toHaveLength(3);

    inputs.forEach((input) => {
      expect(input.disabled).toBe(true);
    });

    expect(document.getElementById("pix-payer-email").disabled).toBe(true);

    expect(document.getElementById("generate-pix-btn").disabled).toBe(true);
  });
});
