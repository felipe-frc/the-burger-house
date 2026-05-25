import {
  addProductToCart,
  decreaseCartItemQuantity,
  findProductById,
  getCartItemCount,
  getCartSubtotal,
  increaseCartItemQuantity,
  removeProductFromCart,
} from "./cart-service.js";
import {
  getLocalizedEntity,
  translate,
  translateItemCount,
} from "./i18n.js";
import { getCart, setCart } from "./state.js";
import { escapeHTML, formatPrice } from "./utils.js";
import { elements, showToast } from "./ui.js";

export {
  getCartSubtotal,
  getDeliveryFee,
  getCartTotalWithDelivery,
} from "./cart-service.js";

function getLocalizedCartItem(item) {
  const product = findProductById(item.id);

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

function updateProceedButtonState() {
  if (!elements.goToAddressBtn) return;

  elements.goToAddressBtn.disabled = getCart().length === 0;
}

function updateProductButtonsState() {
  const cart = getCart();
  const buttons = document.querySelectorAll(".add-to-cart-btn");

  buttons.forEach((button) => {
    const id = button.dataset.id;
    const item = cart.find((cartItem) => cartItem.id === id);
    const indicator = button.querySelector(".product-cart-indicator");
    const product = findProductById(id);
    const localizedProduct = product ? getLocalizedEntity(product) : null;

    if (item) {
      const unit = translate(
        item.quantity === 1 ? "cart.unitSingular" : "cart.unitPlural"
      );

      button.classList.add("btn-add-item-active");
      button.setAttribute(
        "aria-label",
        translate("cart.activeAddAria", undefined, {
          quantity: item.quantity,
          unit,
          name: localizedProduct ? localizedProduct.name : item.name,
        })
      );

      if (indicator) {
        indicator.textContent = item.quantity;
        indicator.classList.remove("hidden");
      }

      return;
    }

    button.classList.remove("btn-add-item-active");
    button.setAttribute(
      "aria-label",
      translate("cart.addAria", undefined, {
        name: localizedProduct ? localizedProduct.name : "produto",
      })
    );

    if (indicator) {
      indicator.textContent = "0";
      indicator.classList.add("hidden");
    }
  });
}

export function updateCart() {
  if (!elements.cartItemsContainer || !elements.cartTotal || !elements.cartCount) {
    updateProductButtonsState();
    return;
  }

  const cart = getCart();
  const count = getCartItemCount(cart);

  elements.cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {
    elements.cartItemsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center py-8 text-zinc-500">
        <i class="fa fa-shopping-basket text-4xl mb-3 text-zinc-300" aria-hidden="true"></i>
        <p class="font-semibold">${escapeHTML(translate("cart.emptyTitle"))}</p>
        <p class="text-sm">${escapeHTML(translate("cart.emptyDescription"))}</p>
      </div>
    `;
  } else {
    cart.forEach((item) => {
      const localizedItem = getLocalizedCartItem(item);
      const itemSubtotal = item.price * item.quantity;
      const div = document.createElement("div");

      div.className = "cart-item-row";

      div.innerHTML = `
        <div class="cart-item-main">
          <p class="cart-item-name">${escapeHTML(localizedItem.name)}</p>
          <p class="cart-item-unit-price">
            ${formatPrice(item.price)} ${escapeHTML(translate("cart.unitPriceSuffix"))}
          </p>

          <div class="cart-item-quantity-controls">
            <button
              type="button"
              class="cart-quantity-btn minus-btn"
              data-id="${escapeHTML(item.id)}"
              aria-label="${escapeHTML(translate("cart.decreaseAria", undefined, { name: localizedItem.name }))}"
            >
              -
            </button>

            <span class="cart-item-quantity">${item.quantity}</span>

            <button
              type="button"
              class="cart-quantity-btn plus-btn"
              data-id="${escapeHTML(item.id)}"
              aria-label="${escapeHTML(translate("cart.increaseAria", undefined, { name: localizedItem.name }))}"
            >
              +
            </button>
          </div>
        </div>

        <div class="cart-item-side">
          <span class="cart-item-subtotal">${formatPrice(itemSubtotal)}</span>

          <button
            type="button"
            class="cart-item-remove remove-btn"
            data-id="${escapeHTML(item.id)}"
            aria-label="${escapeHTML(translate("cart.removeAria", undefined, { name: localizedItem.name }))}"
          >
            ${escapeHTML(translate("cart.remove"))}
          </button>
        </div>
      `;

      elements.cartItemsContainer.appendChild(div);
    });
  }

  elements.cartTotal.textContent = formatPrice(getCartSubtotal(cart));
  elements.cartCount.textContent = count;

  const cartItemCountLabel = document.getElementById("cart-item-count-label");

  if (cartItemCountLabel) {
    cartItemCountLabel.textContent = translateItemCount(count);
  }

  updateProductButtonsState();
  updateProceedButtonState();
}

function addItemToCart(button) {
  if (!button) return;

  const id = button.dataset.id;
  const product = findProductById(id);

  if (!product) {
    console.error(`Produto não encontrado no cardápio: ${id}`);
    return;
  }

  const localizedProduct = getLocalizedEntity(product);
  const updatedCart = addProductToCart(getCart(), product);

  setCart(updatedCart);
  updateCart();
  animateAddToCart(button);
  showToast(
    translate("cart.addedToast", undefined, { name: localizedProduct.name }),
    "#16a34a"
  );
}

function animateAddToCart(button) {
  if (!button) return;

  button.classList.add("scale-110");
  button.style.transition = "transform 0.2s ease";

  setTimeout(() => {
    button.classList.remove("scale-110");
  }, 180);

  if (elements.cartBtn) {
    elements.cartBtn.classList.add("scale-105");
    elements.cartBtn.style.transition = "transform 0.25s ease";

    setTimeout(() => {
      elements.cartBtn.classList.remove("scale-105");
    }, 220);
  }
}

export function bindAddToCartButtons() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-cart-btn");

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    addItemToCart(button);
  });
}

export function bindCartControls() {
  if (!elements.cartItemsContainer) return;

  elements.cartItemsContainer.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".remove-btn");
    const plusBtn = event.target.closest(".plus-btn");
    const minusBtn = event.target.closest(".minus-btn");

    if (removeBtn) {
      const id = removeBtn.dataset.id;
      const updatedCart = removeProductFromCart(getCart(), id);

      setCart(updatedCart);
      updateCart();
      return;
    }

    if (plusBtn) {
      const id = plusBtn.dataset.id;
      const updatedCart = increaseCartItemQuantity(getCart(), id);

      setCart(updatedCart);
      updateCart();
      return;
    }

    if (minusBtn) {
      const id = minusBtn.dataset.id;
      const updatedCart = decreaseCartItemQuantity(getCart(), id);

      setCart(updatedCart);
      updateCart();
    }
  });
}