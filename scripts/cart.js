import { DELIVERY_FEE } from "./config.js";
import { MENU_PRODUCT_BY_ID } from "./data.js";
import { getCart, getOrderType, ORDER_TYPES, saveCart, setCart } from "./state.js";
import { escapeHTML, formatPrice } from "./utils.js";
import { elements, showToast } from "./ui.js";

export function getCartSubtotal() {
  return getCart().reduce((acc, item) => acc + item.price * item.quantity, 0);
}

export function getDeliveryFee() {
  return getCart().length > 0 && getOrderType() === ORDER_TYPES.DELIVERY
    ? DELIVERY_FEE
    : 0;
}

export function getCartTotalWithDelivery() {
  return getCartSubtotal() + getDeliveryFee();
}

export function updateProceedButtonState() {
  if (!elements.goToAddressBtn) return;

  elements.goToAddressBtn.disabled = getCart().length === 0;
}

export function updateProductButtonsState() {
  const cart = getCart();
  const buttons = document.querySelectorAll(".add-to-cart-btn");

  buttons.forEach((button) => {
    const id = button.dataset.id;
    const item = cart.find((cartItem) => cartItem.id === id);
    const indicator = button.querySelector(".product-cart-indicator");

    if (item) {
      button.classList.add("btn-add-item-active");
      button.setAttribute(
        "aria-label",
        `${item.quantity} ${item.quantity === 1 ? "unidade" : "unidades"} de ${item.name} no carrinho. Adicionar mais uma unidade.`
      );

      if (indicator) {
        indicator.textContent = item.quantity;
        indicator.classList.remove("hidden");
      }

      return;
    }

    const product = MENU_PRODUCT_BY_ID.get(id);

    button.classList.remove("btn-add-item-active");
    button.setAttribute(
      "aria-label",
      `Adicionar ${product ? product.name : "produto"} ao carrinho`
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
  let count = 0;

  elements.cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {
    elements.cartItemsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center py-8 text-zinc-500">
        <i class="fa fa-shopping-basket text-4xl mb-3 text-zinc-300" aria-hidden="true"></i>
        <p class="font-semibold">Seu carrinho está vazio</p>
        <p class="text-sm">Adicione itens do cardápio para continuar.</p>
      </div>
    `;
  } else {
    cart.forEach((item) => {
      count += item.quantity;

      const itemSubtotal = item.price * item.quantity;
      const div = document.createElement("div");

      div.className = "cart-item-row";

      div.innerHTML = `
        <div class="cart-item-main">
          <p class="cart-item-name">${escapeHTML(item.name)}</p>
          <p class="cart-item-unit-price">${formatPrice(item.price)} cada</p>

          <div class="cart-item-quantity-controls">
            <button
              type="button"
              class="cart-quantity-btn minus-btn"
              data-id="${escapeHTML(item.id)}"
              aria-label="Diminuir quantidade de ${escapeHTML(item.name)}"
            >
              -
            </button>

            <span class="cart-item-quantity">${item.quantity}</span>

            <button
              type="button"
              class="cart-quantity-btn plus-btn"
              data-id="${escapeHTML(item.id)}"
              aria-label="Aumentar quantidade de ${escapeHTML(item.name)}"
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
            aria-label="Remover ${escapeHTML(item.name)} do carrinho"
          >
            Remover
          </button>
        </div>
      `;

      elements.cartItemsContainer.appendChild(div);
    });
  }

  elements.cartTotal.textContent = formatPrice(getCartSubtotal());
  elements.cartCount.textContent = count;

  const cartItemCountLabel = document.getElementById("cart-item-count-label");

  if (cartItemCountLabel) {
    cartItemCountLabel.textContent = count === 1 ? "1 item" : `${count} itens`;
  }

  saveCart();
  updateProductButtonsState();
  updateProceedButtonState();
}

export function addItemToCart(button) {
  if (!button) return;

  const id = button.dataset.id;
  const product = MENU_PRODUCT_BY_ID.get(id);

  if (!product) {
    console.error(`Produto não encontrado no cardápio: ${id}`);
    return;
  }

  const cart = getCart();
  const existingItem = cart.find((item) => item.id === product.id);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
    });
  }

  saveCart();
  updateCart();
  animateAddToCart(button);
  showToast(`${product.name} adicionado ao carrinho!`, "#16a34a");
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
      const updatedCart = getCart().filter((item) => item.id !== id);

      setCart(updatedCart);
      updateCart();
      return;
    }

    if (plusBtn) {
      const id = plusBtn.dataset.id;
      const cart = getCart();
      const item = cart.find((cartItem) => cartItem.id === id);

      if (item) {
        item.quantity += 1;
        saveCart();
        updateCart();
      }

      return;
    }

    if (minusBtn) {
      const id = minusBtn.dataset.id;
      const cart = getCart();
      const item = cart.find((cartItem) => cartItem.id === id);

      if (!item) return;

      item.quantity -= 1;

      if (item.quantity <= 0) {
        setCart(cart.filter((cartItem) => cartItem.id !== id));
      } else {
        saveCart();
      }

      updateCart();
    }
  });
}
