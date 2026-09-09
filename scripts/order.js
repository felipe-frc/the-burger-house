import { createOrder, createPayment, processCardPayment } from "./api.js";
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

/**
 * @typedef {{
 *   fingerprint: string,
 *   orderId: number,
 *   subtotal: number,
 *   deliveryFee: number,
 *   total: number,
 *   paymentId: number | null,
 *   idempotencyKey: string | null
 * }} CheckoutSession
 */

/** @type {CheckoutSession | null} */
let checkoutSession = null;

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
    throw new Error("O navegador nÃ£o oferece suporte Ã  geraÃ§Ã£o segura de UUID.");
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
  checkoutSession = null;

  unmountPaymentForm();
}

function resetPaymentAttempt() {
  if (!checkoutSession) {
    return;
  }

  checkoutSession.paymentId = null;
  checkoutSession.idempotencyKey = null;
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
        <span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
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
    elements.reviewItems.innerHTML = `<p class="text-zinc-500 italic">${escapeHTML(
      translate("review.empty"),
    )}</p>`;

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
      <span>${escapeHTML(translate("review.orderType"))}</span>

      <span>${escapeHTML(getOrderTypeLabel())}</span>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>${escapeHTML(translate("review.subtotal"))}</span>

      <span>${formatPrice(subtotal)}</span>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>${escapeHTML(translate("review.deliveryFee"))}</span>

      <span>${formatPrice(deliveryFee)}</span>
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
  };

  return checkoutSession;
}

async function ensurePaymentCreated() {
  if (!checkoutSession) {
    throw new Error("O pedido ainda nÃ£o foi preparado para pagamento.");
  }

  if (checkoutSession.paymentId && checkoutSession.idempotencyKey) {
    return checkoutSession.paymentId;
  }

  const idempotencyKey = createIdempotencyKey();

  const payment = await createPayment(checkoutSession.orderId, idempotencyKey);

  checkoutSession.paymentId = payment.paymentId;

  checkoutSession.idempotencyKey = idempotencyKey;

  if (Number.isFinite(Number(payment.amount))) {
    checkoutSession.total = Number(payment.amount);

    setPaymentTotal(checkoutSession.total);
  }

  return payment.paymentId;
}

function buildWhatsAppMessage() {
  if (!checkoutSession) {
    throw new Error("NÃ£o existe pedido confirmado.");
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

    message += `- ${item.quantity}x ${localizedItem.name} (${formatPrice(itemSubtotal)})\n`;
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
  const message = buildWhatsAppMessage();

  const url = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=${encodeURIComponent(message)}`;

  const whatsappWindow = window.open(url, "_blank");

  resetOrderAfterPayment();

  showToast("Pagamento aprovado! Pedido confirmado.", "#16a34a");

  if (!whatsappWindow) {
    window.location.href = url;
  }
}

/**
 * @param {any} cardData
 */
async function handlePaymentSubmit(cardData) {
  if (!checkoutSession) {
    showPaymentError("O pedido nÃ£o estÃ¡ preparado para pagamento.");

    return;
  }

  const paymentToken = String(cardData?.token ?? "").trim();

  const paymentMethodId = String(cardData?.paymentMethodId ?? "").trim();

  const installments = Number(cardData?.installments);

  const payerEmail = String(cardData?.cardholderEmail ?? elements.paymentEmail?.value ?? "").trim();

  if (!paymentToken) {
    showPaymentError("NÃ£o foi possÃ­vel gerar o token do cartÃ£o. Confira os dados.");

    return;
  }

  if (!paymentMethodId) {
    showPaymentError("NÃ£o foi possÃ­vel identificar a bandeira do cartÃ£o.");

    return;
  }

  if (!Number.isInteger(installments) || installments <= 0) {
    showPaymentError("Selecione uma quantidade vÃ¡lida de parcelas.");

    return;
  }

  if (!payerEmail) {
    showPaymentError("Informe o e-mail do pagador.");

    return;
  }

  hidePaymentError();

  setPaymentProcessing(true);

  try {
    const paymentId = await ensurePaymentCreated();

    const result = await processCardPayment(paymentId, {
      paymentToken,
      paymentMethodId,
      installments,
      payerEmail,
    });

    if (Number.isFinite(Number(result.amount))) {
      checkoutSession.total = Number(result.amount);
    }

    if (isApprovedStatus(result.status)) {
      sendConfirmationToWhatsApp();

      return;
    }

    if (isRejectedStatus(result.status)) {
      resetPaymentAttempt();

      showPaymentError("O pagamento foi recusado. Confira os dados do cartÃ£o e tente novamente.");

      return;
    }

    if (isCancelledStatus(result.status)) {
      resetPaymentAttempt();

      showPaymentError("O pagamento foi cancelado. VocÃª pode tentar novamente.");

      return;
    }

    if (isPendingStatus(result.status)) {
      showPaymentError(
        "O pagamento estÃ¡ em anÃ¡lise. Aguarde a confirmaÃ§Ã£o antes de tentar novamente.",
      );

      return;
    }

    showPaymentError("O Mercado Pago retornou um status de pagamento inesperado.");
  } catch (error) {
    console.error("NÃ£o foi possÃ­vel processar o pagamento:", error);

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
        "NÃ£o foi possÃ­vel confirmar o resultado do pagamento. Aguarde antes de tentar novamente.",
      );

      return;
    }

    showPaymentError("NÃ£o foi possÃ­vel processar o pagamento. Tente novamente.");
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

    await initializePaymentForm(session.total, handlePaymentSubmit);
  } catch (error) {
    console.error("NÃ£o foi possÃ­vel preparar o pagamento:", error);

    showPaymentError("NÃ£o foi possÃ­vel carregar o pagamento.");

    showToast("NÃ£o foi possÃ­vel preparar o pagamento. Tente novamente.");
  } finally {
    setGoToPaymentLoading(false);
  }
}

export function bindOrderEvents() {
  if (elements.cartBtn) {
    elements.cartBtn.onclick = () => openModal(elements.cartModal);
  }

  if (elements.closeModalBtn) {
    elements.closeModalBtn.onclick = () => closeAllModals();
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
      loadReview();

      openModal(elements.reviewModal);
    };
  }
}
