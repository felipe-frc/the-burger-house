import {
  createOrder,
  createPayment,
  getPaymentStatus,
  processCardPayment,
  processPixPayment,
} from "./api.js";

import { WHATSAPP_PHONE_NUMBER } from "./config.js";

import { getCartSubtotal, getCartTotalWithDelivery, getDeliveryFee, updateCart } from "./cart.js";

import {
  getAddressText,
  getIsFetchingCep,
  isPickupOrder,
  resetAddressForm,
  validateAddressFields,
} from "./address.js";

import { getLocalizedEntity, translate } from "./i18n.js";

import { MENU_PRODUCT_BY_ID } from "./data.js";

import { clearCart, getCart, getOrderType, ORDER_TYPES, resetOrderType } from "./state.js";

import { escapeHTML, formatPrice, isStoreOpenNow } from "./utils.js";

import { initializePaymentForm, unmountPaymentForm } from "./payment.js";

import {
  PAYMENT_METHODS,
  clearPixInstructions,
  configurePaymentMethodUI,
  getPixPayerEmail,
  getSelectedPaymentMethod,
  resetPaymentMethodUI,
  setPaymentMethodLocked,
  setPixRetryEnabled,
  setPixInstructions,
  setPixStatus,
} from "./payment-methods.js";

import {
  closeAllModals,
  elements,
  hidePaymentError,
  openModal,
  setPaymentProcessing,
  setPaymentTotal,
  showAddressWarning,
  showClosedStoreMessage,
  showPaymentError,
  showToast,
} from "./ui.js";

const PIX_POLL_INTERVAL_MS = 3000;

const PIX_POLL_TIMEOUT_MS = 10 * 60 * 1000;

const PIX_SANDBOX_QR_VISIBLE_MS = 15 * 1000;

/**
 * @typedef {{
 *   fingerprint: string,
 *   orderId: number,
 *   subtotal: number,
 *   deliveryFee: number,
 *   total: number,
 *   paymentId: number | null,
 *   idempotencyKey: string | null,
 *   paymentMethod: number | null,
 *   confirmationDispatched: boolean
 * }} CheckoutSession
 */

/** @type {CheckoutSession | null} */
let checkoutSession = null;

let pixPollingGeneration = 0;

let pixPollingTimerId = null;

function stopPixPolling() {
  pixPollingGeneration++;

  if (pixPollingTimerId !== null) {
    window.clearTimeout(pixPollingTimerId);

    pixPollingTimerId = null;
  }
}

function getOrderNotes() {
  if (!elements.orderNotesInput) {
    return "";
  }

  return elements.orderNotesInput.value.trim();
}

function clearOrderNotes() {
  if (!elements.orderNotesInput) {
    return;
  }

  elements.orderNotesInput.value = "";
}

function getLocalizedCartItem(item) {
  const product = MENU_PRODUCT_BY_ID.get(item.id);

  if (!product) {
    return item;
  }

  return {
    ...item,
    ...getLocalizedEntity(product),
    quantity: item.quantity,
    price: item.price,
  };
}

function getOrderTypeLabel() {
  return getOrderType() === ORDER_TYPES.PICKUP
    ? translate("orderType.pickup")
    : translate("orderType.delivery");
}

function mapCartToApiItems(cart) {
  return cart.map((item) => ({
    productCode: item.id,
    quantity: item.quantity,
    observation: null,
  }));
}

function getCheckoutFingerprint(cart) {
  return JSON.stringify({
    orderType: getOrderType(),
    items: mapCartToApiItems(cart),
  });
}

function createIdempotencyKey() {
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    throw new Error("O navegador não oferece suporte à geração segura de UUID.");
  }

  return globalThis.crypto.randomUUID();
}

function isApprovedStatus(status) {
  return status === 2 || String(status).toLowerCase() === "approved";
}

function isRejectedStatus(status) {
  return status === 3 || String(status).toLowerCase() === "rejected";
}

function isCancelledStatus(status) {
  return status === 4 || String(status).toLowerCase() === "cancelled";
}

function isPendingStatus(status) {
  return status === 1 || String(status).toLowerCase() === "pending";
}

function shouldHoldSandboxPixApproval(payerEmail) {
  if (import.meta.env?.MODE === "test") {
    return false;
  }

  const normalizedEmail = String(payerEmail ?? "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail.endsWith("@testuser.com")) {
    return false;
  }

  const hostname = String(globalThis.location?.hostname ?? "").toLowerCase();

  return hostname === "localhost" || hostname === "127.0.0.1";
}

function showPixInstructionsAndFocus(result) {
  setPixInstructions({
    qrCode: result?.qrCode,

    qrCodeBase64: result?.qrCodeBase64,

    ticketUrl: result?.ticketUrl,
  });

  window.requestAnimationFrame(() => {
    const instructions = document.getElementById("pix-instructions");

    if (instructions && typeof instructions.scrollIntoView === "function") {
      instructions.scrollIntoView({
        behavior: "smooth",

        block: "nearest",
      });
    }
  });
}

/**
 * @param {unknown} error
 * @returns {number | null}
 */
function getApiErrorStatus(error) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = Number(error.status);

  return Number.isInteger(status) ? status : null;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getApiErrorCode(error) {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return "";
  }

  const data = error.data;

  if (typeof data !== "object" || data === null || !("code" in data)) {
    return "";
  }

  return String(data.code ?? "");
}

function resetCheckoutSession() {
  stopPixPolling();

  checkoutSession = null;

  unmountPaymentForm();

  resetPaymentMethodUI();
}

function resetPaymentAttempt() {
  stopPixPolling();

  if (!checkoutSession) {
    return;
  }

  checkoutSession.paymentId = null;

  checkoutSession.idempotencyKey = null;

  checkoutSession.paymentMethod = null;

  setPaymentMethodLocked(false);

  clearPixInstructions();
}

function setGoToPaymentLoading(isLoading) {
  const button = elements.goToPaymentBtn;

  if (!button) {
    return;
  }

  if (isLoading) {
    button.disabled = true;

    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.classList.add("opacity-80", "cursor-not-allowed");

    button.innerHTML = `
      <span class="inline-flex items-center gap-2">
        <span
          class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"
        ></span>

        Preparando...
      </span>
    `;

    return;
  }

  button.disabled = false;

  button.classList.remove("opacity-80", "cursor-not-allowed");

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
  }
}

function loadReview() {
  if (!elements.reviewItems || !elements.reviewAddress || !elements.reviewTotal) {
    return;
  }

  const cart = getCart();

  elements.reviewItems.innerHTML = "";

  if (cart.length === 0) {
    elements.reviewItems.innerHTML = `
      <p class="text-zinc-500 italic">
        ${escapeHTML(translate("review.empty"))}
      </p>
    `;

    elements.reviewAddress.textContent = translate("review.addressMissing");

    elements.reviewTotal.textContent = formatPrice(0);

    return;
  }

  const subtotal = getCartSubtotal();

  const deliveryFee = getDeliveryFee();

  const totalWithDelivery = getCartTotalWithDelivery();

  cart.forEach((item) => {
    const localizedItem = getLocalizedCartItem(item);

    const itemSubtotal = item.price * item.quantity;

    const itemRow = document.createElement("div");

    itemRow.className = "flex items-center justify-between gap-3 border-b border-zinc-200 pb-2";

    itemRow.innerHTML = `
        <div class="min-w-0">
          <p class="font-medium text-zinc-800 break-words">
            ${item.quantity}x ${escapeHTML(localizedItem.name)}
          </p>
        </div>

        <span class="font-semibold text-amber-700 whitespace-nowrap">
          ${formatPrice(itemSubtotal)}
        </span>
      `;

    elements.reviewItems.appendChild(itemRow);
  });

  const summaryDiv = document.createElement("div");

  summaryDiv.className = "pt-3 mt-2 space-y-2";

  summaryDiv.innerHTML = `
    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>
        ${escapeHTML(translate("review.orderType"))}
      </span>

      <span>
        ${escapeHTML(getOrderTypeLabel())}
      </span>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>
        ${escapeHTML(translate("review.subtotal"))}
      </span>

      <span>
        ${formatPrice(subtotal)}
      </span>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>
        ${escapeHTML(translate("review.deliveryFee"))}
      </span>

      <span>
        ${formatPrice(deliveryFee)}
      </span>
    </div>
  `;

  elements.reviewItems.appendChild(summaryDiv);

  elements.reviewAddress.textContent = getAddressText();

  elements.reviewTotal.textContent = formatPrice(totalWithDelivery);
}

async function prepareOrderForPayment() {
  const cart = getCart();

  const fingerprint = getCheckoutFingerprint(cart);

  if (checkoutSession && checkoutSession.fingerprint === fingerprint) {
    return checkoutSession;
  }

  resetCheckoutSession();

  const createdOrder = await createOrder(getOrderType(), mapCartToApiItems(cart));

  checkoutSession = {
    fingerprint,

    orderId: createdOrder.orderId,

    subtotal: createdOrder.subtotal,

    deliveryFee: createdOrder.deliveryFee,

    total: createdOrder.total,

    paymentId: null,

    idempotencyKey: null,

    paymentMethod: null,

    confirmationDispatched: false,
  };

  return checkoutSession;
}

async function ensurePaymentCreated(paymentMethod) {
  if (!checkoutSession) {
    throw new Error("O pedido ainda não foi preparado para pagamento.");
  }

  if (checkoutSession.paymentId && checkoutSession.idempotencyKey) {
    if (checkoutSession.paymentMethod !== paymentMethod) {
      throw new Error("Já existe uma tentativa de pagamento ativa com outro meio de pagamento.");
    }

    return checkoutSession.paymentId;
  }

  const idempotencyKey = createIdempotencyKey();

  const payment =
    paymentMethod === PAYMENT_METHODS.CREDIT_CARD
      ? await createPayment(checkoutSession.orderId, idempotencyKey)
      : await createPayment(checkoutSession.orderId, idempotencyKey, paymentMethod);

  checkoutSession.paymentId = payment.paymentId;

  checkoutSession.idempotencyKey = idempotencyKey;

  checkoutSession.paymentMethod = paymentMethod;

  if (Number.isFinite(Number(payment.amount))) {
    checkoutSession.total = Number(payment.amount);

    setPaymentTotal(checkoutSession.total);
  }

  return payment.paymentId;
}

function buildWhatsAppMessage() {
  if (!checkoutSession) {
    throw new Error("Não existe pedido confirmado.");
  }

  const cart = getCart();

  const addressText = getAddressText();

  const orderNotes = getOrderNotes();

  let message = `\u{1F354} *${translate("whatsapp.newOrder")}*\n\n`;

  message += `*${translate("whatsapp.orderType")}:* ${getOrderTypeLabel()}\n\n`;

  message += `*${translate("whatsapp.items")}:*\n`;

  cart.forEach((item) => {
    const localizedItem = getLocalizedCartItem(item);

    const itemSubtotal = item.price * item.quantity;

    message +=
      `- ${item.quantity}x ` + `${localizedItem.name} ` + `(${formatPrice(itemSubtotal)})\n`;
  });

  message += `\n*${translate("whatsapp.summary")}:*\n`;

  message += `${translate("whatsapp.subtotal")}: ${formatPrice(checkoutSession.subtotal)}\n`;

  message += `${translate("whatsapp.deliveryFee")}: ${formatPrice(checkoutSession.deliveryFee)}\n`;

  message += `${translate("whatsapp.total")}: ${formatPrice(checkoutSession.total)}\n`;

  message += isPickupOrder()
    ? `\n*${translate("whatsapp.pickupAddress")}:*\n${addressText}\n`
    : `\n*${translate("whatsapp.deliveryAddress")}:*\n${addressText}\n`;

  if (orderNotes) {
    message += `\n*${translate("whatsapp.notes")}:*\n${orderNotes}\n`;
  }

  return message;
}

function resetOrderAfterPayment() {
  stopPixPolling();

  clearCart();

  updateCart();

  resetOrderType();

  resetAddressForm();

  clearOrderNotes();

  setPaymentProcessing(false);

  closeAllModals();

  resetCheckoutSession();
}

function sendConfirmationToWhatsApp() {
  if (!checkoutSession || checkoutSession.confirmationDispatched) {
    return;
  }

  checkoutSession.confirmationDispatched = true;

  const message = buildWhatsAppMessage();

  const url =
    `https://wa.me/` + `${WHATSAPP_PHONE_NUMBER}` + `?text=${encodeURIComponent(message)}`;

  const whatsappWindow = window.open(url, "_blank");

  resetOrderAfterPayment();

  showToast("Pagamento aprovado! Pedido confirmado.", "#16a34a");

  if (!whatsappWindow) {
    window.location.href = url;
  }
}

function isPaymentModalOpen() {
  return Boolean(elements.paymentModal && !elements.paymentModal.classList.contains("hidden"));
}

function startPixStatusPolling(paymentId, approvalNotBefore = 0) {
  stopPixPolling();

  const generation = pixPollingGeneration;

  const startedAt = Date.now();

  let consecutiveFailures = 0;

  const scheduleNextCheck = (delay = PIX_POLL_INTERVAL_MS) => {
    pixPollingTimerId = window.setTimeout(checkStatus, delay);
  };

  const checkStatus = async () => {
    pixPollingTimerId = null;

    if (generation !== pixPollingGeneration) {
      return;
    }

    if (!checkoutSession || checkoutSession.paymentId !== paymentId) {
      return;
    }

    if (!isPaymentModalOpen()) {
      return;
    }

    if (Date.now() - startedAt >= PIX_POLL_TIMEOUT_MS) {
      stopPixPolling();

      setPixStatus("O tempo de acompanhamento automático terminou.");

      showPaymentError(
        "Ainda não recebemos a confirmação do PIX. Verifique o pagamento antes de gerar uma nova cobrança.",
      );

      return;
    }

    try {
      const result = await getPaymentStatus(paymentId);

      if (
        generation !== pixPollingGeneration ||
        !checkoutSession ||
        checkoutSession.paymentId !== paymentId ||
        !isPaymentModalOpen()
      ) {
        return;
      }

      consecutiveFailures = 0;

      if (Number.isFinite(Number(result.amount))) {
        checkoutSession.total = Number(result.amount);

        setPaymentTotal(checkoutSession.total);
      }

      if (isApprovedStatus(result.status)) {
        if (approvalNotBefore > Date.now()) {
          setPixStatus("PIX gerado. Aguardando confirmação do pagamento.");

          scheduleNextCheck(Math.max(PIX_POLL_INTERVAL_MS, approvalNotBefore - Date.now()));

          return;
        }

        setPixStatus("Pagamento aprovado!");

        stopPixPolling();

        sendConfirmationToWhatsApp();

        return;
      }

      if (isRejectedStatus(result.status)) {
        setPixStatus("Pagamento PIX recusado.");

        resetPaymentAttempt();

        showPaymentError("O pagamento PIX foi recusado. Você pode gerar uma nova cobrança.");

        return;
      }

      if (isCancelledStatus(result.status)) {
        setPixStatus("Pagamento PIX cancelado.");

        resetPaymentAttempt();

        showPaymentError("O pagamento PIX foi cancelado. Você pode tentar novamente.");

        return;
      }

      if (isPendingStatus(result.status)) {
        setPixStatus("Aguardando confirmação do pagamento...");

        scheduleNextCheck();

        return;
      }

      stopPixPolling();

      showPaymentError("O pagamento retornou um status inesperado.");
    } catch (error) {
      if (
        generation !== pixPollingGeneration ||
        !checkoutSession ||
        checkoutSession.paymentId !== paymentId ||
        !isPaymentModalOpen()
      ) {
        return;
      }

      console.error("Não foi possível consultar o status do PIX:", error);

      consecutiveFailures++;

      if (consecutiveFailures >= 3) {
        setPixStatus("Conexão instável. Continuaremos tentando confirmar o pagamento.");
      }

      scheduleNextCheck();
    }
  };

  const initialDelay =
    approvalNotBefore > Date.now()
      ? Math.max(PIX_POLL_INTERVAL_MS, approvalNotBefore - Date.now())
      : PIX_POLL_INTERVAL_MS;

  pixPollingTimerId = window.setTimeout(checkStatus, initialDelay);
}

async function activateSelectedPaymentMethod(amount) {
  const paymentMethod = getSelectedPaymentMethod();

  unmountPaymentForm();

  if (paymentMethod === PAYMENT_METHODS.PIX) {
    return;
  }

  await initializePaymentForm(amount, handleCardPaymentSubmit);
}

/**
 * @param {any} cardData
 */
async function handleCardPaymentSubmit(cardData) {
  if (!checkoutSession) {
    showPaymentError("O pedido não está preparado para pagamento.");

    return;
  }

  const selectedMethod = getSelectedPaymentMethod();

  if (
    selectedMethod !== PAYMENT_METHODS.CREDIT_CARD &&
    selectedMethod !== PAYMENT_METHODS.DEBIT_CARD
  ) {
    showPaymentError("Selecione crédito ou débito para pagar com cartão.");

    return;
  }

  const paymentToken = String(cardData?.token ?? "").trim();

  const paymentMethodId = String(cardData?.paymentMethodId ?? "").trim();

  const paymentTypeId = String(cardData?.paymentTypeId ?? "").trim();

  const installments =
    selectedMethod === PAYMENT_METHODS.DEBIT_CARD ? 1 : Number(cardData?.installments);

  const payerEmail = String(cardData?.cardholderEmail ?? elements.paymentEmail?.value ?? "").trim();

  const payerIdentificationType = String(cardData?.identificationType ?? "").trim();

  const payerIdentificationNumber = String(cardData?.identificationNumber ?? "").trim();

  if (!paymentToken) {
    showPaymentError("Não foi possível gerar o token do cartão. Confira os dados.");

    return;
  }

  if (!paymentMethodId) {
    showPaymentError("Não foi possível identificar a bandeira do cartão.");

    return;
  }

  if (!paymentTypeId) {
    showPaymentError("Não foi possível identificar o tipo do cartão.");

    return;
  }

  if (!Number.isInteger(installments) || installments <= 0) {
    showPaymentError("Selecione uma quantidade válida de parcelas.");

    return;
  }

  if (!payerEmail) {
    showPaymentError("Informe o e-mail do pagador.");

    return;
  }

  if (!payerIdentificationType) {
    showPaymentError("Selecione o tipo de documento do pagador.");

    return;
  }

  if (!payerIdentificationNumber) {
    showPaymentError("Informe o número do documento do pagador.");

    return;
  }

  hidePaymentError();

  setPaymentProcessing(true);

  setPaymentMethodLocked(true);

  try {
    const paymentId = await ensurePaymentCreated(selectedMethod);

    const cardPaymentPayload = {
      paymentToken,
      paymentMethodId,
      paymentTypeId,
      installments,
      payerEmail,
      payerIdentificationType,
      payerIdentificationNumber,
    };

    const result = await processCardPayment(paymentId, cardPaymentPayload);

    if (Number.isFinite(Number(result.amount))) {
      checkoutSession.total = Number(result.amount);
    }

    if (isApprovedStatus(result.status)) {
      sendConfirmationToWhatsApp();

      return;
    }

    if (isRejectedStatus(result.status)) {
      resetPaymentAttempt();

      showPaymentError("O pagamento foi recusado. Confira os dados do cartão e tente novamente.");

      return;
    }

    if (isCancelledStatus(result.status)) {
      resetPaymentAttempt();

      showPaymentError("O pagamento foi cancelado. Você pode tentar novamente.");

      return;
    }

    if (isPendingStatus(result.status)) {
      showPaymentError(
        "O pagamento está em análise. Aguarde a confirmação antes de tentar novamente.",
      );

      return;
    }

    showPaymentError("O Mercado Pago retornou um status de pagamento inesperado.");
  } catch (error) {
    console.error("Não foi possível processar o pagamento:", error);

    const status = getApiErrorStatus(error);

    const code = getApiErrorCode(error);

    if (status === 422 || code === "payment_provider_rejected") {
      resetPaymentAttempt();

      showPaymentError(
        "O Mercado Pago recusou esta tentativa. Confira os dados e tente novamente.",
      );

      return;
    }

    if (status === 502 || code === "payment_provider_unavailable") {
      showPaymentError(
        "Não foi possível confirmar o resultado do pagamento. Aguarde antes de tentar novamente.",
      );

      return;
    }

    if (!checkoutSession?.paymentId) {
      setPaymentMethodLocked(false);
    }

    showPaymentError("Não foi possível processar o pagamento. Tente novamente.");
  } finally {
    setPaymentProcessing(false);
  }
}

async function handlePixPaymentSubmit() {
  if (!checkoutSession) {
    showPaymentError("O pedido não está preparado para pagamento.");

    return;
  }

  const payerEmail = getPixPayerEmail();

  if (!payerEmail) {
    showPaymentError("Informe o e-mail do pagador para gerar o PIX.");

    return;
  }

  if (!payerEmail.includes("@")) {
    showPaymentError("Informe um e-mail válido.");

    return;
  }

  hidePaymentError();

  clearPixInstructions();

  setPixStatus("Gerando PIX...");

  setPaymentProcessing(true);

  setPaymentMethodLocked(true);

  try {
    const paymentId = await ensurePaymentCreated(PAYMENT_METHODS.PIX);

    const result = await processPixPayment(paymentId, {
      payerEmail,
    });

    if (Number.isFinite(Number(result.amount))) {
      checkoutSession.total = Number(result.amount);

      setPaymentTotal(checkoutSession.total);
    }

    const hasPixInstructions = Boolean(
      String(result?.qrCode ?? "").trim() ||
      String(result?.qrCodeBase64 ?? "").trim() ||
      String(result?.ticketUrl ?? "").trim(),
    );

    if (hasPixInstructions || isPendingStatus(result.status)) {
      showPixInstructionsAndFocus(result);
    }

    const approvalNotBefore =
      hasPixInstructions && shouldHoldSandboxPixApproval(payerEmail)
        ? Date.now() + PIX_SANDBOX_QR_VISIBLE_MS
        : 0;

    if (isApprovedStatus(result.status)) {
      if (approvalNotBefore > Date.now()) {
        setPixStatus("PIX gerado. Aguardando confirmação do pagamento.");

        showToast("PIX gerado. Agora conclua o pagamento pelo seu banco.", "#0284c7");

        startPixStatusPolling(paymentId, approvalNotBefore);

        return;
      }

      sendConfirmationToWhatsApp();

      return;
    }

    if (isRejectedStatus(result.status)) {
      resetPaymentAttempt();

      showPaymentError("Não foi possível gerar o pagamento PIX. Tente novamente.");

      return;
    }

    if (isCancelledStatus(result.status)) {
      resetPaymentAttempt();

      showPaymentError("A cobrança PIX foi cancelada.");

      return;
    }

    if (isPendingStatus(result.status)) {
      setPixStatus("PIX gerado. Aguardando confirmação do pagamento.");

      showToast("PIX gerado. Agora conclua o pagamento pelo seu banco.", "#0284c7");

      startPixStatusPolling(paymentId, approvalNotBefore);

      return;
    }

    showPaymentError("O Mercado Pago retornou um status PIX inesperado.");
  } catch (error) {
    console.error("Não foi possível gerar o PIX:", error);

    const status = getApiErrorStatus(error);

    const code = getApiErrorCode(error);

    if (status === 422 || code === "payment_provider_rejected") {
      resetPaymentAttempt();

      showPaymentError(
        "O Mercado Pago recusou a criação do PIX. Confira os dados e tente novamente.",
      );

      return;
    }

    if (status === 502 || code === "payment_provider_unavailable") {
      setPixRetryEnabled();

      setPixStatus("Não foi possível confirmar a criação da cobrança.");

      showPaymentError(
        "O resultado da criação do PIX não pôde ser confirmado. Aguarde antes de tentar novamente.",
      );

      return;
    }

    if (!checkoutSession?.paymentId) {
      setPaymentMethodLocked(false);
    } else {
      setPixRetryEnabled();
    }

    showPaymentError("Não foi possível gerar o PIX. Tente novamente.");
  } finally {
    setPaymentProcessing(false);
  }
}

async function openPaymentStep() {
  const cart = getCart();

  if (cart.length === 0) {
    showToast(translate("cart.emptyToast"));

    return;
  }

  if (!isStoreOpenNow()) {
    showClosedStoreMessage();

    return;
  }

  if (!validateAddressFields()) {
    openModal(elements.addressModal);

    return;
  }

  hidePaymentError();

  setGoToPaymentLoading(true);

  try {
    const session = await prepareOrderForPayment();

    setPaymentTotal(session.total);

    openModal(elements.paymentModal);

    configurePaymentMethodUI({
      defaultMethod: PAYMENT_METHODS.CREDIT_CARD,

      onMethodChange: async () => {
        stopPixPolling();

        hidePaymentError();

        clearPixInstructions();

        try {
          await activateSelectedPaymentMethod(session.total);
        } catch (error) {
          console.error("Não foi possível trocar o meio de pagamento:", error);

          showPaymentError("Não foi possível carregar o meio de pagamento selecionado.");
        }
      },

      onPixSubmit: handlePixPaymentSubmit,
    });

    await activateSelectedPaymentMethod(session.total);
  } catch (error) {
    console.error("Não foi possível preparar o pagamento:", error);

    showPaymentError("Não foi possível carregar o pagamento.");

    showToast("Não foi possível preparar o pagamento. Tente novamente.");
  } finally {
    setGoToPaymentLoading(false);
  }
}

export function bindOrderEvents() {
  if (elements.cartBtn) {
    elements.cartBtn.onclick = () => openModal(elements.cartModal);
  }

  if (elements.closeModalBtn) {
    elements.closeModalBtn.onclick = () => {
      stopPixPolling();

      closeAllModals();
    };
  }

  if (elements.goToAddressBtn) {
    elements.goToAddressBtn.onclick = () => {
      if (getCart().length === 0) {
        showToast(translate("cart.needItemToast"));

        return;
      }

      if (!isStoreOpenNow()) {
        showClosedStoreMessage();

        return;
      }

      openModal(elements.addressModal);
    };
  }

  if (elements.backToCartBtn) {
    elements.backToCartBtn.onclick = () => openModal(elements.cartModal);
  }

  if (elements.goToReviewBtn) {
    elements.goToReviewBtn.onclick = () => {
      if (!isStoreOpenNow()) {
        showClosedStoreMessage();

        return;
      }

      if (!isPickupOrder() && getIsFetchingCep()) {
        showAddressWarning(translate("address.waitCep"));

        return;
      }

      if (!validateAddressFields()) {
        return;
      }

      loadReview();

      openModal(elements.reviewModal);
    };
  }

  if (elements.backToAddressBtn) {
    elements.backToAddressBtn.onclick = () => openModal(elements.addressModal);
  }

  if (elements.goToPaymentBtn) {
    elements.goToPaymentBtn.onclick = openPaymentStep;
  }

  if (elements.backToReviewBtn) {
    elements.backToReviewBtn.onclick = () => {
      stopPixPolling();

      unmountPaymentForm();

      loadReview();

      openModal(elements.reviewModal);
    };
  }
}
