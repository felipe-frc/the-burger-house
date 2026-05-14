import { WHATSAPP_PHONE_NUMBER } from "./config.js";
import {
  getCartSubtotal,
  getCartTotalWithDelivery,
  getDeliveryFee,
  updateCart,
} from "./cart.js";
import {
  getAddressText,
  getIsFetchingCep,
  resetAddressForm,
  validateAddressFields,
} from "./address.js";
import { clearCart, getCart } from "./state.js";
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

export function loadReview() {
  if (!elements.reviewItems || !elements.reviewAddress || !elements.reviewTotal) {
    return;
  }

  const cart = getCart();

  elements.reviewItems.innerHTML = "";

  if (cart.length === 0) {
    elements.reviewItems.innerHTML = `<p class="text-zinc-500 italic">Nenhum item no pedido.</p>`;
    elements.reviewAddress.textContent = "Endereço não informado.";
    elements.reviewTotal.textContent = formatPrice(0);
    return;
  }

  const subtotal = getCartSubtotal();
  const deliveryFee = getDeliveryFee();
  const totalWithDelivery = getCartTotalWithDelivery();

  cart.forEach((item) => {
    const itemSubtotal = item.price * item.quantity;
    const itemRow = document.createElement("div");

    itemRow.className =
      "flex items-center justify-between gap-3 border-b border-zinc-200 pb-2";

    itemRow.innerHTML = `
      <div class="min-w-0">
        <p class="font-medium text-zinc-800 break-words">
          ${item.quantity}x ${escapeHTML(item.name)}
        </p>
      </div>

      <span class="font-semibold text-amber-600 whitespace-nowrap">
        ${formatPrice(itemSubtotal)}
      </span>
    `;

    elements.reviewItems.appendChild(itemRow);
  });

  const summaryDiv = document.createElement("div");
  summaryDiv.className = "pt-3 mt-2 space-y-2";

  summaryDiv.innerHTML = `
    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>Subtotal</span>
      <span>${formatPrice(subtotal)}</span>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-600">
      <span>Taxa de entrega</span>
      <span>${formatPrice(deliveryFee)}</span>
    </div>
  `;

  elements.reviewItems.appendChild(summaryDiv);

  elements.reviewAddress.textContent = getAddressText();
  elements.reviewTotal.textContent = formatPrice(totalWithDelivery);
}

function finishOrder() {
  const cart = getCart();

  if (cart.length === 0) {
    showToast("Seu carrinho está vazio.");
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

  const addressText = getAddressText();
  const orderNotes = getOrderNotes();
  const subtotal = getCartSubtotal();
  const deliveryFee = getDeliveryFee();
  const totalWithDelivery = getCartTotalWithDelivery();

  let message = "🍔 *Novo Pedido - The Burger House*\n\n";
  message += "*Itens do pedido:*\n";

  cart.forEach((item) => {
    const itemSubtotal = item.price * item.quantity;
    message += `- ${item.quantity}x ${item.name} (${formatPrice(itemSubtotal)})\n`;
  });

  message += "\n*Resumo:*\n";
  message += `Subtotal: ${formatPrice(subtotal)}\n`;
  message += `Taxa de entrega: ${formatPrice(deliveryFee)}\n`;
  message += `Total: ${formatPrice(totalWithDelivery)}\n`;

  message += `\n*Endereço de entrega:*\n${addressText}\n`;

  if (orderNotes) {
    message += `\n*Observações do pedido:*\n${orderNotes}\n`;
  }

  const url = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=${encodeURIComponent(
    message
  )}`;

  window.open(url, "_blank");

  setTimeout(() => {
    clearCart();
    updateCart();
    resetAddressForm();
    clearOrderNotes();
    closeAllModals();
    setFinishButtonLoading(false);
    showToast("Pedido enviado! Seu carrinho foi limpo.", "#16a34a");
  }, 900);
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
        showToast("Adicione pelo menos 1 item ao carrinho para continuar.");
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

      if (getIsFetchingCep()) {
        showAddressWarning("Aguarde a busca do CEP terminar.");
        return;
      }

      if (!validateAddressFields()) return;

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