import { createOrder } from "./api.js";
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
  openModal,
  setFinishButtonLoading,
  showAddressWarning,
  showClosedStoreMessage,
  showToast,
} from "./ui.js";

function getOrderNotes() {
  if (!elements.orderNotesInput) return "";

  return elements.orderNotesInput.value.trim();
}

function clearOrderNotes() {
  if (!elements.orderNotesInput) return;

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

function resetOrderAfterFinish() {
  clearCart();
  updateCart();
  resetOrderType();
  resetAddressForm();
  clearOrderNotes();
  closeAllModals();
  setFinishButtonLoading(false);
}

function mapCartToApiItems(cart) {
  return cart.map((item) => ({
    productCode: item.id,
    quantity: item.quantity,
    observation: null,
  }));
}

async function finishOrder() {
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

  setFinishButtonLoading(true);

  try {
    const orderType = getOrderType();

    const createdOrder = await createOrder(orderType, mapCartToApiItems(cart));

    const addressText = getAddressText();

    const orderNotes = getOrderNotes();

    const subtotal = createdOrder.subtotal;

    const deliveryFee = createdOrder.deliveryFee;

    const total = createdOrder.total;

    let message = `\u{1F354} *${translate("whatsapp.newOrder")}*\n\n`;

    message += `*${translate("whatsapp.orderType")}:* ${getOrderTypeLabel()}\n\n`;

    message += `*${translate("whatsapp.items")}:*\n`;

    cart.forEach((item) => {
      const localizedItem = getLocalizedCartItem(item);

      const itemSubtotal = item.price * item.quantity;

      message += `- ${item.quantity}x ${localizedItem.name} (${formatPrice(itemSubtotal)})\n`;
    });

    message += `\n*${translate("whatsapp.summary")}:*\n`;

    message += `${translate("whatsapp.subtotal")}: ${formatPrice(subtotal)}\n`;

    message += `${translate("whatsapp.deliveryFee")}: ${formatPrice(deliveryFee)}\n`;

    message += `${translate("whatsapp.total")}: ${formatPrice(total)}\n`;

    message += isPickupOrder()
      ? `\n*${translate("whatsapp.pickupAddress")}:*\n${addressText}\n`
      : `\n*${translate("whatsapp.deliveryAddress")}:*\n${addressText}\n`;

    if (orderNotes) {
      message += `\n*${translate("whatsapp.notes")}:*\n${orderNotes}\n`;
    }

    const url = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");

    setTimeout(() => {
      resetOrderAfterFinish();

      showToast(translate("order.sentToast"), "#16a34a");
    }, 900);
  } catch (error) {
    console.error("Não foi possível criar o pedido:", error);

    setFinishButtonLoading(false);

    showToast("Não foi possível criar o pedido. Tente novamente.");
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

  if (elements.finishOrderBtn) {
    elements.finishOrderBtn.onclick = finishOrder;
  }
}
