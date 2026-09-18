import { createOrder, createCheckout, getPaymentStatus } from "./api.js";
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
import {
  closeAllModals,
  elements,
  hidePaymentError,
  openModal,
  showAddressWarning,
  showClosedStoreMessage,
  showPaymentError,
  showToast,
} from "./ui.js";

const CHECKOUT_STORAGE_KEY = "burger-house-checkout";
const RETURN_FIELDS = [
  "cep",
  "street",
  "house-number",
  "neighborhood",
  "city",
  "complement",
  "order-notes",
];
/** @type {any} */
let checkoutSession = null;
let preparingCheckout = false;
let checkingPayment = false;

function saveCheckoutContext() {
  sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(checkoutSession));
}

function readCheckoutContext() {
  try {
    const value = JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY) || "null");
    if (
      value &&
      Number.isInteger(value.orderId) &&
      value.orderId > 0 &&
      Number.isFinite(value.total) &&
      typeof value.fingerprint === "string"
    )
      return value;
  } catch {
    /* Missing or invalid browser context cannot confirm a payment. */
  }
  return null;
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

export async function openPaymentStep() {
  if (preparingCheckout) return;
  const cart = getCart();
  if (!cart.length) {
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
  preparingCheckout = true;
  setGoToPaymentLoading(true);
  hidePaymentError();
  try {
    const fingerprint = getCheckoutFingerprint(cart);
    if (
      !checkoutSession ||
      checkoutSession.confirmationDispatched ||
      checkoutSession.fingerprint !== fingerprint
    ) {
      const order = await createOrder(getOrderType(), mapCartToApiItems(cart));
      checkoutSession = { ...order, fingerprint, paymentId: null, confirmationDispatched: false };
      saveCheckoutContext();
    }
    const checkout = await createCheckout(checkoutSession.orderId);
    const url = new URL(checkout.initPoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["www.mercadopago.com.br", "sandbox.mercadopago.com.br"].includes(url.hostname)
    ) {
      throw new Error("O checkout retornou um endereço inválido.");
    }
    checkoutSession.paymentId = checkout.paymentId;
    checkoutSession.message = buildWhatsAppMessage();
    checkoutSession.fields = Object.fromEntries(
      RETURN_FIELDS.map((id) => [
        id,
        /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id))
          ?.value || "",
      ]),
    );
    saveCheckoutContext();
    window.location.href = url.href;
  } catch {
    showToast("Não foi possível abrir o checkout. Tente novamente.");
  } finally {
    preparingCheckout = false;
    setGoToPaymentLoading(false);
  }
}

export async function checkCheckoutReturn() {
  if (checkingPayment) return null;
  checkoutSession ??= readCheckoutContext();
  if (!Number.isInteger(checkoutSession?.paymentId) || checkoutSession.paymentId <= 0) return null;
  checkingPayment = true;
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("check-payment-btn")
  );
  const confirmation = document.getElementById("confirm-whatsapp-btn");
  const status = document.getElementById("checkout-status");
  confirmation?.classList.add("hidden");
  if (button) button.disabled = true;
  openModal(elements.paymentModal);
  hidePaymentError();
  try {
    const payment = await getPaymentStatus(checkoutSession.paymentId);
    if (
      payment.paymentId !== checkoutSession.paymentId ||
      payment.orderId !== checkoutSession.orderId ||
      Number(payment.amount) !== checkoutSession.total
    )
      throw new Error("Pagamento incompatível com o pedido.");
    const messages = {
      1: "Aguardando confirmação do pagamento. Você pode consultar novamente em instantes.",
      2: "Pagamento aprovado! Confirme o envio do pedido pelo WhatsApp.",
      3: "Pagamento recusado. Volte à revisão para tentar novamente.",
      4: "Pagamento cancelado. Volte à revisão para tentar novamente.",
      5: "Pagamento reembolsado.",
      6: "Pagamento parcialmente reembolsado.",
      7: "Pagamento contestado. Entre em contato com o restaurante.",
    };
    if (status)
      status.textContent = messages[payment.status] || "Status de pagamento não reconhecido.";
    if (
      payment.status === 2 &&
      !checkoutSession.confirmationDispatched &&
      checkoutSession.message
    ) {
      confirmation?.classList.remove("hidden");
    }
    return payment;
  } catch {
    showPaymentError(
      "Não foi possível confirmar o pagamento. Consulte novamente antes de repetir a compra.",
    );
    return null;
  } finally {
    checkingPayment = false;
    if (button) button.disabled = false;
  }
}

async function confirmWhatsApp() {
  const payment = await checkCheckoutReturn();
  if (payment?.status !== 2 || checkoutSession.confirmationDispatched) return;
  checkoutSession.confirmationDispatched = true;
  saveCheckoutContext();
  const url = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=${encodeURIComponent(checkoutSession.message)}`;
  // Preserve a different cart assembled while the previous purchase was in progress.
  if (getCheckoutFingerprint(getCart()) === checkoutSession.fingerprint) {
    clearCart();
    updateCart();
    resetOrderType();
    resetAddressForm();
    clearOrderNotes();
  }
  closeAllModals();
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
  else window.location.href = url;
}

export function bindOrderEvents() {
  checkoutSession = readCheckoutContext();
  if (
    checkoutSession?.fields &&
    !checkoutSession.confirmationDispatched &&
    checkoutSession.fingerprint === getCheckoutFingerprint(getCart())
  ) {
    for (const id of RETURN_FIELDS) {
      const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (
        document.getElementById(id)
      );
      if (input && typeof checkoutSession.fields[id] === "string")
        input.value = checkoutSession.fields[id];
    }
  }
  if (checkoutSession?.paymentId && !checkoutSession.confirmationDispatched)
    void checkCheckoutReturn();
  document
    .getElementById("check-payment-btn")
    ?.addEventListener("click", () => void checkCheckoutReturn());
  document
    .getElementById("confirm-whatsapp-btn")
    ?.addEventListener("click", () => void confirmWhatsApp());
  if (elements.cartBtn) {
    elements.cartBtn.onclick = () => openModal(elements.cartModal);
  }

  if (elements.closeModalBtn) {
    elements.closeModalBtn.onclick = () => {
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
      loadReview();

      openModal(elements.reviewModal);
    };
  }
}
