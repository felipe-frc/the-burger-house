export const PAYMENT_METHODS = Object.freeze({
  PIX: 1,
  CREDIT_CARD: 2,
  DEBIT_CARD: 3,
});

/** @type {number} */
let selectedPaymentMethod = PAYMENT_METHODS.CREDIT_CARD;

let paymentMethodLocked = false;

/** @type {((method: number) => Promise<void> | void) | null} */
let paymentMethodChangeHandler = null;

/** @type {(() => Promise<void> | void) | null} */
let pixSubmitHandler = null;

function getPaymentForm() {
  return /** @type {HTMLFormElement | null} */ (document.getElementById("form-checkout"));
}

function getSubmitButton() {
  return /** @type {HTMLButtonElement | null} */ (document.getElementById("form-checkout__submit"));
}

function getInstallmentsContainer() {
  const installments = document.getElementById("form-checkout__installments");

  return installments?.parentElement ?? null;
}

function getPaymentModalSubtitle() {
  return document.querySelector("#payment-modal .cart-modal-subtitle");
}

function getPaymentSecurityMessage() {
  return document.getElementById("payment-security-message");
}

function findExistingSecurityMessage() {
  const existing = getPaymentSecurityMessage();

  if (existing) {
    return existing;
  }

  const form = getPaymentForm();

  if (!form) {
    return null;
  }

  const candidate = form.previousElementSibling;

  if (!(candidate instanceof HTMLElement)) {
    return null;
  }

  if (!candidate.querySelector(".fa-lock")) {
    return null;
  }

  candidate.id = "payment-security-message";

  return candidate;
}

function ensurePaymentMethodUI() {
  const existing = document.getElementById("payment-method-selector");

  if (existing) {
    return existing;
  }

  const form = getPaymentForm();

  if (!form || !form.parentElement) {
    throw new Error("O formulário de pagamento não foi encontrado.");
  }

  findExistingSecurityMessage();

  const container = document.createElement("div");

  container.id = "payment-method-selector";

  container.className = "space-y-5";

  container.innerHTML = `
    <fieldset>
      <legend class="mb-3 text-sm font-bold text-zinc-800">
        Como deseja pagar?
      </legend>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label class="cursor-pointer">
          <input
            type="radio"
            name="payment-method"
            value="${PAYMENT_METHODS.PIX}"
            class="peer sr-only"
          />

          <span
            class="flex h-full items-center gap-3 rounded-xl border-2 border-zinc-200 bg-white p-4 transition
                   peer-checked:border-sky-500 peer-checked:bg-sky-50
                   hover:border-zinc-300"
          >
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"
            >
              <i class="fa fa-qrcode" aria-hidden="true"></i>
            </span>

            <span>
              <strong class="block text-sm text-zinc-900">
                PIX
              </strong>

              <small class="text-xs text-zinc-500">
                Pagamento instantâneo
              </small>
            </span>
          </span>
        </label>

        <label class="cursor-pointer">
          <input
            type="radio"
            name="payment-method"
            value="${PAYMENT_METHODS.CREDIT_CARD}"
            class="peer sr-only"
            checked
          />

          <span
            class="flex h-full items-center gap-3 rounded-xl border-2 border-zinc-200 bg-white p-4 transition
                   peer-checked:border-amber-500 peer-checked:bg-amber-50
                   hover:border-zinc-300"
          >
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
            >
              <i class="fa fa-credit-card" aria-hidden="true"></i>
            </span>

            <span>
              <strong class="block text-sm text-zinc-900">
                Crédito
              </strong>

              <small class="text-xs text-zinc-500">
                Parcelamento disponível
              </small>
            </span>
          </span>
        </label>

        <label class="cursor-pointer">
          <input
            type="radio"
            name="payment-method"
            value="${PAYMENT_METHODS.DEBIT_CARD}"
            class="peer sr-only"
          />

          <span
            class="flex h-full items-center gap-3 rounded-xl border-2 border-zinc-200 bg-white p-4 transition
                   peer-checked:border-emerald-500 peer-checked:bg-emerald-50
                   hover:border-zinc-300"
          >
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <i class="fa fa-credit-card" aria-hidden="true"></i>
            </span>

            <span>
              <strong class="block text-sm text-zinc-900">
                Débito
              </strong>

              <small class="text-xs text-zinc-500">
                Pagamento à vista
              </small>
            </span>
          </span>
        </label>
      </div>
    </fieldset>

    <div
      class="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4"
    >
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sky-700 shadow-sm"
      >
        <i class="fa fa-shield-halved" aria-hidden="true"></i>
      </span>

      <div>
        <p class="text-sm font-bold text-zinc-800">
          Pagamento processado com segurança pelo Mercado Pago
        </p>

        <p class="mt-1 text-xs leading-relaxed text-zinc-600">
          A The Burger House não armazena os dados sensíveis do seu cartão.
        </p>
      </div>
    </div>

    <section
      id="pix-payment-panel"
      class="hidden space-y-4"
      aria-label="Pagamento por PIX"
    >
      <div>
        <label
          for="pix-payer-email"
          class="mb-1 block text-sm font-bold text-zinc-700"
        >
          E-mail do pagador*
        </label>

        <input
          type="email"
          id="pix-payer-email"
          autocomplete="email"
          placeholder="email@exemplo.com"
          class="w-full rounded-lg border-2 border-zinc-200 bg-white p-3 outline-none transition-colors focus:border-sky-500"
        />

        <p class="mt-1 text-xs text-zinc-500">
          O e-mail é enviado ao Mercado Pago para gerar a cobrança PIX.
        </p>
      </div>

      <div
        id="pix-instructions"
        class="hidden rounded-xl border border-zinc-200 bg-white p-5"
      >
        <div class="flex flex-col items-center gap-4">
          <div>
            <p class="text-center text-base font-black text-zinc-900">
              Escaneie o QR Code
            </p>

            <p class="mt-1 text-center text-xs text-zinc-500">
              Abra o aplicativo do seu banco e escolha pagar com PIX.
            </p>
          </div>

          <img
            id="pix-qr-image"
            class="hidden h-52 w-52 rounded-xl border border-zinc-200 bg-white p-2"
            alt="QR Code para pagamento PIX"
          />

          <div class="w-full">
            <label
              for="pix-copy-code"
              class="mb-1 block text-sm font-bold text-zinc-700"
            >
              PIX Copia e Cola
            </label>

            <textarea
              id="pix-copy-code"
              rows="3"
              readonly
              class="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 outline-none"
            ></textarea>

            <button
              type="button"
              id="copy-pix-code-btn"
              class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-sky-500 bg-white px-4 py-3 text-sm font-bold text-sky-700 transition hover:bg-sky-50"
            >
              <i class="fa fa-copy" aria-hidden="true"></i>
              <span>Copiar código PIX</span>
            </button>
          </div>

          <a
            id="pix-ticket-url"
            class="hidden text-sm font-bold text-sky-700 underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir cobrança no Mercado Pago
          </a>

          <div
            id="pix-status"
            class="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm font-semibold text-amber-800"
            aria-live="polite"
          >
            Aguardando geração do PIX.
          </div>
        </div>
      </div>
    </section>
  `;

  form.parentElement.insertBefore(container, form);

  const paymentMethodInputs = container.querySelectorAll("input[name='payment-method']");

  paymentMethodInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!(input instanceof HTMLInputElement) || !input.checked) {
        return;
      }

      const method = Number(input.value);

      if (!/** @type {number[]} */ (Object.values(PAYMENT_METHODS)).includes(method)) {
        return;
      }

      selectedPaymentMethod = method;

      applyPaymentMethodUI();

      if (paymentMethodChangeHandler) {
        Promise.resolve(paymentMethodChangeHandler(method)).catch((error) => {
          console.error("Não foi possível trocar o meio de pagamento:", error);
        });
      }
    });
  });

  return container;
}

function updateSecurityMessage() {
  const securityMessage = getPaymentSecurityMessage();

  if (!securityMessage) {
    return;
  }

  if (selectedPaymentMethod === PAYMENT_METHODS.PIX) {
    securityMessage.innerHTML = `
      <i
        class="fa fa-lock mt-0.5 text-emerald-600"
        aria-hidden="true"
      ></i>

      <div>
        <p class="font-bold">
          PIX seguro
        </p>

        <p class="mt-1 text-xs leading-relaxed text-emerald-800">
          A cobrança será criada pelo Mercado Pago.
          O pedido só será confirmado depois da aprovação do pagamento.
        </p>
      </div>
    `;

    return;
  }

  securityMessage.innerHTML = `
    <i
      class="fa fa-lock mt-0.5 text-emerald-600"
      aria-hidden="true"
    ></i>

    <div>
      <p class="font-bold">
        Pagamento seguro
      </p>

      <p class="mt-1 text-xs leading-relaxed text-emerald-800">
        Os dados sensíveis do cartão são processados diretamente pelo Mercado Pago
        e transformados em um token seguro antes de chegarem à nossa API.
      </p>
    </div>
  `;
}

function updateModalSubtitle() {
  const subtitle = getPaymentModalSubtitle();

  if (!subtitle) {
    return;
  }

  if (selectedPaymentMethod === PAYMENT_METHODS.PIX) {
    subtitle.textContent = "Gere o PIX e conclua o pagamento pelo aplicativo do seu banco.";

    return;
  }

  if (selectedPaymentMethod === PAYMENT_METHODS.DEBIT_CARD) {
    subtitle.textContent = "Preencha os dados do cartão de débito para pagar à vista.";

    return;
  }

  subtitle.textContent = "Preencha os dados do cartão de crédito para concluir o pedido.";
}

function updateSubmitButton() {
  const button = getSubmitButton();

  if (!button) {
    return;
  }

  if (selectedPaymentMethod === PAYMENT_METHODS.PIX) {
    button.type = "button";

    button.removeAttribute("form");

    button.innerHTML = `
      <i class="fa fa-qrcode" aria-hidden="true"></i>
      <span>Gerar PIX</span>
    `;

    button.onclick = () => {
      if (!pixSubmitHandler || button.disabled) {
        return;
      }

      Promise.resolve(pixSubmitHandler()).catch((error) => {
        console.error("Não foi possível gerar o PIX:", error);
      });
    };

    return;
  }

  button.onclick = null;

  button.type = "submit";

  button.setAttribute("form", "form-checkout");

  if (selectedPaymentMethod === PAYMENT_METHODS.DEBIT_CARD) {
    button.innerHTML = `
      <i class="fa fa-lock" aria-hidden="true"></i>
      <span>Pagar no débito</span>
    `;

    return;
  }

  button.innerHTML = `
    <i class="fa fa-lock" aria-hidden="true"></i>
    <span>Pagar no crédito</span>
  `;
}

function applyPaymentMethodUI() {
  const form = getPaymentForm();

  const pixPanel = document.getElementById("pix-payment-panel");

  const installmentsContainer = getInstallmentsContainer();

  if (!form || !pixPanel) {
    return;
  }

  const isPix = selectedPaymentMethod === PAYMENT_METHODS.PIX;

  const isDebit = selectedPaymentMethod === PAYMENT_METHODS.DEBIT_CARD;

  form.classList.toggle("hidden", isPix);

  pixPanel.classList.toggle("hidden", !isPix);

  if (installmentsContainer) {
    installmentsContainer.classList.toggle("hidden", isDebit);
  }

  updateModalSubtitle();
  updateSecurityMessage();
  updateSubmitButton();
}

export function configurePaymentMethodUI({
  onMethodChange,
  onPixSubmit,
  defaultMethod = PAYMENT_METHODS.CREDIT_CARD,
}) {
  paymentMethodChangeHandler = onMethodChange;

  pixSubmitHandler = onPixSubmit;

  const container = ensurePaymentMethodUI();

  if (!paymentMethodLocked) {
    selectedPaymentMethod = defaultMethod;
  }

  const input = /** @type {HTMLInputElement | null} */ (
    container.querySelector(`input[name='payment-method'][value='${selectedPaymentMethod}']`)
  );

  if (input) {
    input.checked = true;
  }

  applyPaymentMethodUI();

  return selectedPaymentMethod;
}

export function getSelectedPaymentMethod() {
  return selectedPaymentMethod;
}

export function getPixPayerEmail() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById("pix-payer-email"));

  return input?.value.trim() ?? "";
}

export function setPaymentMethodLocked(locked) {
  paymentMethodLocked = locked;

  const container = document.getElementById("payment-method-selector");

  if (!container) {
    return;
  }

  container.querySelectorAll("input[name='payment-method']").forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.disabled = locked;
    }
  });

  container.classList.toggle("opacity-80", locked);
}

export function clearPixInstructions() {
  const instructions = document.getElementById("pix-instructions");

  const image = /** @type {HTMLImageElement | null} */ (document.getElementById("pix-qr-image"));

  const code = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("pix-copy-code"));

  const ticket = /** @type {HTMLAnchorElement | null} */ (
    document.getElementById("pix-ticket-url")
  );

  if (instructions) {
    instructions.classList.add("hidden");
  }

  if (image) {
    image.removeAttribute("src");
    image.classList.add("hidden");
  }

  if (code) {
    code.value = "";
  }

  if (ticket) {
    ticket.removeAttribute("href");
    ticket.classList.add("hidden");
  }
}

export function setPixStatus(message) {
  const status = document.getElementById("pix-status");

  if (!status) {
    return;
  }

  status.textContent = message;
}

function normalizeQrImageSource(base64) {
  const value = String(base64 ?? "").trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("data:image/")) {
    return value;
  }

  return `data:image/png;base64,${value}`;
}

async function copyPixCode(value) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(value);

    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;

  textarea.style.position = "fixed";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);

  textarea.select();

  document.execCommand("copy");

  textarea.remove();
}

export function setPixInstructions({ qrCode, qrCodeBase64, ticketUrl }) {
  const instructions = document.getElementById("pix-instructions");

  const image = /** @type {HTMLImageElement | null} */ (document.getElementById("pix-qr-image"));

  const codeField = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("pix-copy-code")
  );

  const copyButton = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("copy-pix-code-btn")
  );

  const ticket = /** @type {HTMLAnchorElement | null} */ (
    document.getElementById("pix-ticket-url")
  );

  if (!instructions) {
    return;
  }

  const normalizedQrCode = String(qrCode ?? "").trim();

  const imageSource = normalizeQrImageSource(qrCodeBase64);

  instructions.classList.remove("hidden");

  if (image && imageSource) {
    image.src = imageSource;
    image.classList.remove("hidden");
  }

  if (codeField) {
    codeField.value = normalizedQrCode;
  }

  if (copyButton) {
    copyButton.disabled = !normalizedQrCode;

    copyButton.onclick = async () => {
      if (!normalizedQrCode) {
        return;
      }

      try {
        await copyPixCode(normalizedQrCode);

        const label = copyButton.querySelector("span");

        if (label) {
          label.textContent = "Código copiado!";

          window.setTimeout(() => {
            label.textContent = "Copiar código PIX";
          }, 2000);
        }
      } catch (error) {
        console.error("Não foi possível copiar o PIX:", error);
      }
    };
  }

  if (ticket) {
    const value = String(ticketUrl ?? "").trim();

    if (value) {
      try {
        const url = new URL(value);

        if (url.protocol === "https:" || url.protocol === "http:") {
          ticket.href = url.toString();

          ticket.classList.remove("hidden");
        }
      } catch {
        ticket.removeAttribute("href");
        ticket.classList.add("hidden");
      }
    }
  }
}

export function resetPaymentMethodUI() {
  paymentMethodLocked = false;

  selectedPaymentMethod = PAYMENT_METHODS.CREDIT_CARD;

  clearPixInstructions();

  const container = document.getElementById("payment-method-selector");

  if (!container) {
    return;
  }

  container.querySelectorAll("input[name='payment-method']").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.disabled = false;

    input.checked = Number(input.value) === selectedPaymentMethod;
  });

  container.classList.remove("opacity-80");

  applyPaymentMethodUI();
}
