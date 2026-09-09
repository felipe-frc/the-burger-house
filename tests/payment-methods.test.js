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

      <form id="form-checkout">
        <div id="installments-wrapper">
          <label for="form-checkout__installments">
            Parcelas
          </label>

          <select
            id="form-checkout__installments"
          ></select>
        </div>
      </form>

      <button
        type="submit"
        id="form-checkout__submit"
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

    expect(document.getElementById("form-checkout").classList.contains("hidden")).toBe(false);

    expect(document.getElementById("pix-payment-panel").classList.contains("hidden")).toBe(true);
  });

  it("shows Pix UI and hides the card form", async () => {
    const onMethodChange = vi.fn();

    const paymentMethods = await loadModule();

    paymentMethods.configurePaymentMethodUI({
      onMethodChange,
      onPixSubmit: vi.fn(),
    });

    const pixInput = document.querySelector("input[name='payment-method'][value='1']");

    pixInput.checked = true;

    pixInput.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    expect(paymentMethods.getSelectedPaymentMethod()).toBe(paymentMethods.PAYMENT_METHODS.PIX);

    expect(document.getElementById("form-checkout").classList.contains("hidden")).toBe(true);

    expect(document.getElementById("pix-payment-panel").classList.contains("hidden")).toBe(false);

    const button = document.getElementById("form-checkout__submit");

    expect(button.type).toBe("button");

    expect(button.textContent).toContain("Gerar PIX");

    expect(onMethodChange).toHaveBeenCalledWith(1);
  });

  it("shows debit card and hides installments", async () => {
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

    expect(document.getElementById("form-checkout").classList.contains("hidden")).toBe(false);

    expect(document.getElementById("installments-wrapper").classList.contains("hidden")).toBe(true);

    const button = document.getElementById("form-checkout__submit");

    expect(button.type).toBe("submit");

    expect(button.textContent).toContain("Pagar no débito");

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

  it("locks payment method after a payment attempt begins", async () => {
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
  });
});
