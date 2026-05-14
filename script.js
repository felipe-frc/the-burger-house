// ===== CONFIG =====
const DELIVERY_FEE = 5;
const FORCE_STORE_OPEN = true; // Mudar o horário para fins de teste

const MENU_CATEGORIES = [
  {
    title: "Nossos Hambúrgueres",
    icon: "fas fa-burger",
    subtitle: "Combinações irresistíveis de sabor e qualidade",
    items: [
      {
        id: "burger-praiano",
        name: "O Praiano",
        description:
          "Queijo coalho grelhado com fio de mel, banana-da-terra frita, bacon crocante e maionese defumada.",
        price: 43.9,
        image: "./assets/praiano-burguer.webp",
        tag: "Mais Pedido",
      },
      {
        id: "burger-onion-rings",
        name: "O Famoso Onion Ring",
        description:
          "Aioli de alho assado, queijo suíço derretido, bacon e anéis de cebola gigantes crocantes.",
        price: 43.9,
        image: "./assets/onion-rings-burguer.webp",
        tag: "Destaque",
      },
      {
        id: "burger-crispy-chicken-cheddar",
        name: "Crispy Chicken Cheddar",
        description:
          "Filé de frango crocante com cheddar derretido, bacon, alface, tomate e maionese defumada.",
        price: 35.9,
        image: "./assets/crispy-chicken-burguer.webp",
      },
      {
        id: "burger-outback-king",
        name: "O Outback King",
        description:
          "Creme de cheddar artesanal, cebola caramelizada, cubos de bacon crocante e molho barbecue especial.",
        price: 43.9,
        image: "./assets/outback-king-burguer.webp",
        tag: "Premium",
      },
      {
        id: "burger-chicken-grill-supreme",
        name: "Chicken Grill Supreme",
        description:
          "Filé de frango grelhado com cheddar, bacon, alface, tomate, cebola crispy e maionese defumada.",
        price: 35.9,
        image: "./assets/chicken-supreme-burguer.webp",
      },
      {
        id: "burger-joia-da-coroa",
        name: "A Joia da Coroa",
        description:
          "Burger de picanha premium com queijo Canastra Real, cogumelos salteados e aioli de trufas brancas.",
        price: 58.9,
        image: "./assets/joia-burguer.webp",
        tag: "Exclusivo",
      },
    ],
  },
  {
    title: "Acompanhamentos",
    icon: "fas fa-utensils",
    subtitle: "Complementos perfeitos para sua refeição",
    items: [
      {
        id: "side-fritas-cheddar",
        name: "Fritas Cheddar & Bacon",
        description:
          "Batatas fritas crocantes mergulhadas em creme de cheddar artesanal com cubos de bacon crocante.",
        price: 24.9,
        image: "./assets/batata-bacon.webp",
      },
      {
        id: "side-batata-rustica",
        name: "Batatas Rústicas da Casa",
        description:
          "Cortes grossos com casca, fritos até ficarem crocantes, temperados com sal grosso e alecrim.",
        price: 18.9,
        image: "./assets/batata-rustica.webp",
      },
      {
        id: "side-aneis-cebola",
        name: "Anéis de Cebola Crocantes",
        description:
          "Anéis de cebola empanados em mistura secreta e fritos à perfeição com molho barbecue especial.",
        price: 22.9,
        image: "./assets/anel-cebola.webp",
      },
    ],
  },
  {
    title: "Bebidas",
    icon: "fas fa-glass-cheers",
    subtitle: "Refrescos para acompanhar seu pedido",
    items: [
      {
        id: "drink-coca-lata",
        name: "Coca-Cola Lata",
        description:
          "Refrigerante gelado e refrescante para complementar sua refeição.",
        price: 5.9,
        image: "./assets/refri-1.webp",
      },
      {
        id: "drink-guarana-antarctica",
        name: "Guaraná Antarctica",
        description:
          "Refrigerante com sabor único e refrescante para sua satisfação.",
        price: 5.9,
        image: "./assets/refri-2.webp",
      },
    ],
  },
];

const MENU_PRODUCTS = MENU_CATEGORIES.flatMap((category) => category.items);
const MENU_PRODUCT_BY_ID = new Map(MENU_PRODUCTS.map((item) => [item.id, item]));

// ===== ELEMENTOS =====
const menuSection = document.getElementById("menu");

const cartModal = document.getElementById("cart-modal");
const addressModal = document.getElementById("address-modal");
const reviewModal = document.getElementById("review-modal");

const cartBtn = document.getElementById("cart-btn");
const cartFooter = document.querySelector(".cart-footer");

const closeModalBtn = document.getElementById("close-modal-btn");
const goToAddressBtn = document.getElementById("go-to-address-btn");
const backToCartBtn = document.getElementById("back-to-cart-btn");
const goToReviewBtn = document.getElementById("go-to-review-btn");
const backToAddressBtn = document.getElementById("back-to-address-btn");
const finishOrderBtn = document.getElementById("finish-order-btn");

const cartItemsContainer = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
const cartCount = document.getElementById("cart-count");

const cepInput = document.getElementById("cep");
const streetInput = document.getElementById("street");
const neighborhoodInput = document.getElementById("neighborhood");
const cityInput = document.getElementById("city");
const houseNumberInput = document.getElementById("house-number");
const complementInput = document.getElementById("complement");
const addressWarn = document.getElementById("address-warn");
const cepLoading = document.getElementById("cep-loading");

const reviewItems = document.getElementById("review-items");
const reviewAddress = document.getElementById("review-address");
const reviewTotal = document.getElementById("review-total");

const dateSpan = document.getElementById("date-span");
const statusText = document.getElementById("status-text");

// ===== ESTADO =====
let cart = JSON.parse(localStorage.getItem("cart")) || [];
let isFetchingCep = false;
let isFinishingOrder = false;
let lastFetchedCep = "";

// ===== UTIL =====
function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getCartSubtotal() {
  return cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
}

function getDeliveryFee() {
  return cart.length > 0 ? DELIVERY_FEE : 0;
}

function getCartTotalWithDelivery() {
  return getCartSubtotal() + getDeliveryFee();
}

function isStoreOpenNow() {
   if (FORCE_STORE_OPEN) return false; // Mudar o horário para fins de testes
  const now = new Date();
  const hour = now.getHours();

  return hour >= 18 && hour < 23;
}

// ===== SCROLL REVEAL =====
function revealOnScroll() {
  const reveals = document.querySelectorAll(".reveal");
  const windowHeight = window.innerHeight;

  reveals.forEach((el) => {
    const elementTop = el.getBoundingClientRect().top;

    if (elementTop < windowHeight - 100) {
      el.classList.add("active");
    }
  });
}

// ===== HELPERS =====
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function openModal(modal) {
  closeAllModals();

  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeAllModals() {
  if (cartModal) cartModal.classList.add("hidden");
  if (addressModal) addressModal.classList.add("hidden");
  if (reviewModal) reviewModal.classList.add("hidden");

  document.body.style.overflow = "";
}

function showAddressWarning(message) {
  if (!addressWarn) return;

  addressWarn.textContent = message;
  addressWarn.classList.remove("hidden");
}

function hideAddressWarning() {
  if (!addressWarn) return;

  addressWarn.classList.add("hidden");
}

function clearAddressFields() {
  if (streetInput) streetInput.value = "";
  if (neighborhoodInput) neighborhoodInput.value = "";
  if (cityInput) cityInput.value = "";
}

function clearDeliveryFields() {
  clearAddressFields();

  if (houseNumberInput) houseNumberInput.value = "";
  if (complementInput) complementInput.value = "";
}

function isValidHouseNumber(value) {
  return /^[0-9]+$/.test(value.trim());
}

function getAddressText() {
  const street = streetInput ? streetInput.value.trim() : "";
  const houseNumber = houseNumberInput ? houseNumberInput.value.trim() : "";
  const neighborhood = neighborhoodInput ? neighborhoodInput.value.trim() : "";
  const city = cityInput ? cityInput.value.trim() : "";
  const complement = complementInput ? complementInput.value.trim() : "";

  return `${street}, ${houseNumber} - ${neighborhood}, ${city}${
    complement ? ` | Complemento: ${complement}` : ""
  }`;
}

function updateProceedButtonState() {
  if (!goToAddressBtn) return;

  goToAddressBtn.disabled = cart.length === 0;
}

function showToast(message, background = "#ef4444") {
  if (typeof Toastify === "undefined") {
    console.error("Toastify não carregado:", message);
    return;
  }

  Toastify({
    text: message,
    duration: 3000,
    gravity: "top",
    position: "right",
    stopOnFocus: true,
    style: {
      background,
      color: "#ffffff",
      borderRadius: "10px",
    },
  }).showToast();
}

function showClosedStoreMessage() {
  showToast("Estamos fechados no momento. Funcionamos das 18h às 23h.");
}

function animateAddToCart(button) {
  if (!button) return;

  button.classList.add("scale-110");
  button.style.transition = "transform 0.2s ease";

  setTimeout(() => {
    button.classList.remove("scale-110");
  }, 180);

  if (cartBtn) {
    cartBtn.classList.add("scale-105");
    cartBtn.style.transition = "transform 0.25s ease";

    setTimeout(() => {
      cartBtn.classList.remove("scale-105");
    }, 220);
  }
}

function setFinishButtonLoading(isLoading) {
  if (!finishOrderBtn) return;

  if (isLoading) {
    finishOrderBtn.disabled = true;
    finishOrderBtn.dataset.originalHtml = finishOrderBtn.innerHTML;
    finishOrderBtn.classList.add("opacity-80", "cursor-not-allowed");
    finishOrderBtn.innerHTML = `
      <span class="inline-flex items-center gap-2">
        <span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        Enviando pedido...
      </span>
    `;
    return;
  }

  finishOrderBtn.disabled = false;
  finishOrderBtn.classList.remove("opacity-80", "cursor-not-allowed");

  if (finishOrderBtn.dataset.originalHtml) {
    finishOrderBtn.innerHTML = finishOrderBtn.dataset.originalHtml;
  }
}

function clearCartAfterOrder() {
  cart = [];
  saveCart();
  updateCart();
}

function resetAddressForm() {
  if (cepInput) cepInput.value = "";
  clearDeliveryFields();
  hideAddressWarning();
  lastFetchedCep = "";
}

function showFloatingCart() {
  if (!cartFooter) return;

  cartFooter.classList.remove("cart-footer-hidden", "cart-footer-bottom");
  cartFooter.classList.add("cart-footer-visible");
}

function showBottomCart() {
  if (!cartFooter) return;

  cartFooter.classList.remove("cart-footer-hidden");
  cartFooter.classList.add("cart-footer-visible", "cart-footer-bottom");
}

function hideCartFooter() {
  if (!cartFooter) return;

  cartFooter.classList.remove("cart-footer-visible", "cart-footer-bottom");
  cartFooter.classList.add("cart-footer-hidden");
}

function setupCartVisibility() {
  if (!menuSection) return;

  function updateCartVisibility() {
    const menuStart = menuSection.offsetTop - 80;
    const pageBottomThreshold =
      document.documentElement.scrollHeight - window.innerHeight - 40;

    const hasReachedMenu = window.scrollY >= menuStart;
    const hasReachedPageBottom = window.scrollY >= pageBottomThreshold;

    if (!hasReachedMenu) {
      hideCartFooter();
      return;
    }

    if (hasReachedPageBottom) {
      showBottomCart();
      return;
    }

    showFloatingCart();
  }

  updateCartVisibility();

  window.addEventListener("scroll", updateCartVisibility);
  window.addEventListener("resize", updateCartVisibility);
}

// ===== RENDERIZAÇÃO DO CARDÁPIO =====
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderProductCard(product) {
  const tagHTML = product.tag
    ? `<span class="product-item-tag">${escapeHTML(product.tag)}</span>`
    : "";

  return `
    <div class="product-item-card reveal">
      <div class="product-item-img-wrapper">
        <img
          src="${escapeHTML(product.image)}"
          alt="${escapeHTML(product.name)}"
          class="product-item-img"
          loading="lazy"
        />
      </div>

      <div class="product-item-info">
        <div class="product-item-name-row">
          <h3 class="product-item-name">${escapeHTML(product.name)}</h3>
          ${tagHTML}
        </div>

        <p class="product-item-desc">${escapeHTML(product.description)}</p>

        <div class="product-item-footer">
          <span class="product-item-price">${formatPrice(product.price)}</span>

          <button
            type="button"
            class="btn-add-item add-to-cart-btn"
            data-id="${escapeHTML(product.id)}"
            aria-label="Adicionar ${escapeHTML(product.name)} ao carrinho"
          >
            <i class="fa fa-plus" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderMenuCategory(category) {
  return `
    <section class="max-w-5xl mx-auto px-4">
      <div class="section-header">
        <h2 class="section-title">
          <i class="${escapeHTML(category.icon)} text-amber-500" aria-hidden="true"></i>
          <span class="section-title-text">${escapeHTML(category.title)}</span>
        </h2>

        <p class="section-subtitle">${escapeHTML(category.subtitle)}</p>
      </div>

      <div class="products-list-container">
        ${category.items.map(renderProductCard).join("")}
      </div>
    </section>
  `;
}

function renderMenu() {
  const menuCategoriesContainer = document.getElementById("menu-categories");

  if (!menuCategoriesContainer) return;

  menuCategoriesContainer.innerHTML = MENU_CATEGORIES.map(renderMenuCategory).join("");
}

// ===== ADICIONAR ITEM =====
function addItemToCart(button) {
  if (!button) return;

  const id = button.dataset.id;
  const product = MENU_PRODUCT_BY_ID.get(id);

  if (!product) {
    console.error(`Produto não encontrado no cardápio: ${id}`);
    return;
  }

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

function bindAddToCartButtons() {
  document.addEventListener("click", (e) => {
    const button = e.target.closest(".add-to-cart-btn");

    if (!button) return;

    e.preventDefault();
    e.stopPropagation();
    addItemToCart(button);
  });
}

// ===== ATUALIZAR CARRINHO =====
function updateCart() {
  if (!cartItemsContainer || !cartTotal || !cartCount) return;

  cartItemsContainer.innerHTML = "";

  let count = 0;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
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

      div.className =
        "flex items-start justify-between gap-4 py-4 border-b border-zinc-200";

      div.innerHTML = `
        <div class="flex-1 min-w-0">
          <p class="font-bold text-zinc-800 break-words">${escapeHTML(item.name)}</p>
          <p class="text-sm text-zinc-500">${formatPrice(item.price)} cada</p>

          <div class="flex items-center gap-2 mt-3">
            <button
              type="button"
              class="minus-btn w-8 h-8 rounded-md border border-zinc-300 hover:bg-zinc-100 transition"
              data-id="${escapeHTML(item.id)}"
              aria-label="Diminuir quantidade de ${escapeHTML(item.name)}"
            >
              -
            </button>

            <span class="min-w-[24px] text-center font-semibold">${item.quantity}</span>

            <button
              type="button"
              class="plus-btn w-8 h-8 rounded-md border border-zinc-300 hover:bg-zinc-100 transition"
              data-id="${escapeHTML(item.id)}"
              aria-label="Aumentar quantidade de ${escapeHTML(item.name)}"
            >
              +
            </button>
          </div>
        </div>

        <div class="flex flex-col items-end gap-2">
          <span class="font-bold text-amber-600">${formatPrice(itemSubtotal)}</span>

          <button
            type="button"
            class="remove-btn text-red-500 text-sm font-medium hover:text-red-700 transition whitespace-nowrap"
            data-id="${escapeHTML(item.id)}"
            aria-label="Remover ${escapeHTML(item.name)} do carrinho"
          >
            Remover
          </button>
        </div>
      `;

      cartItemsContainer.appendChild(div);
    });
  }

  cartTotal.textContent = formatPrice(getCartSubtotal());
  cartCount.textContent = count;

  const cartItemCountLabel = document.getElementById("cart-item-count-label");

  if (cartItemCountLabel) {
    cartItemCountLabel.textContent = count === 1 ? "1 item" : `${count} itens`;
  }

  saveCart();
  updateProceedButtonState();
}

// ===== EVENTOS DO CARRINHO =====
if (cartItemsContainer) {
  cartItemsContainer.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".remove-btn");
    const plusBtn = e.target.closest(".plus-btn");
    const minusBtn = e.target.closest(".minus-btn");

    if (removeBtn) {
      const id = removeBtn.dataset.id;
      cart = cart.filter((item) => item.id !== id);
      updateCart();
      return;
    }

    if (plusBtn) {
      const id = plusBtn.dataset.id;
      const item = cart.find((cartItem) => cartItem.id === id);

      if (item) {
        item.quantity += 1;
        updateCart();
      }

      return;
    }

    if (minusBtn) {
      const id = minusBtn.dataset.id;
      const item = cart.find((cartItem) => cartItem.id === id);

      if (item) {
        item.quantity -= 1;

        if (item.quantity <= 0) {
          cart = cart.filter((cartItem) => cartItem.id !== id);
        }

        updateCart();
      }
    }
  });
}

// ===== MODAIS =====
if (cartBtn) {
  cartBtn.onclick = () => openModal(cartModal);
}

if (closeModalBtn) {
  closeModalBtn.onclick = () => closeAllModals();
}

if (goToAddressBtn) {
  goToAddressBtn.onclick = () => {
    if (cart.length === 0) {
      showToast("Adicione pelo menos 1 item ao carrinho para continuar.");
      return;
    }

    if (!isStoreOpenNow()) {
      showClosedStoreMessage();
      return;
    }

    openModal(addressModal);
  };
}

if (backToCartBtn) {
  backToCartBtn.onclick = () => openModal(cartModal);
}

if (goToReviewBtn) {
  goToReviewBtn.onclick = () => {
    if (!isStoreOpenNow()) {
      showClosedStoreMessage();
      return;
    }

    if (isFetchingCep) {
      showAddressWarning("Aguarde a busca do CEP terminar.");
      return;
    }

    if (!validateAddressFields()) return;

    loadReview();
    openModal(reviewModal);
  };
}

if (backToAddressBtn) {
  backToAddressBtn.onclick = () => openModal(addressModal);
}

document.querySelectorAll(".close-modal-x").forEach((button) => {
  button.addEventListener("click", closeAllModals);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllModals();
  }
});

[cartModal, addressModal, reviewModal].forEach((modal) => {
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeAllModals();
    }
  });
});

// ===== ENDEREÇO =====
async function fetchAddressByCep() {
  if (!cepInput) return;

  const cep = cepInput.value.replace(/\D/g, "");

  if (cep.length !== 8) {
    clearDeliveryFields();
    hideAddressWarning();
    lastFetchedCep = "";
    return;
  }

  if (cep === lastFetchedCep) return;

  try {
    isFetchingCep = true;
    lastFetchedCep = cep;

    if (cepLoading) {
      cepLoading.classList.remove("hidden");
    }

    hideAddressWarning();

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);

    if (!response.ok) {
      throw new Error("Falha ao consultar o CEP.");
    }

    const data = await response.json();

    if (data.erro) {
      clearDeliveryFields();
      lastFetchedCep = "";
      showAddressWarning("CEP não encontrado. Verifique o número informado.");
      return;
    }

    const street = data.logradouro || "";
    const neighborhood = data.bairro || "";
    const city = data.localidade || "";

    if (streetInput) streetInput.value = street;
    if (neighborhoodInput) neighborhoodInput.value = neighborhood;
    if (cityInput) cityInput.value = city;

    if (!street || !neighborhood || !city) {
      clearAddressFields();
      showAddressWarning(
        "Não foi possível preencher o endereço completo com esse CEP."
      );
      return;
    }

    hideAddressWarning();
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);

    clearDeliveryFields();
    lastFetchedCep = "";
    showAddressWarning(
      "Erro ao buscar o CEP. Verifique sua conexão e tente novamente."
    );
  } finally {
    isFetchingCep = false;

    if (cepLoading) {
      cepLoading.classList.add("hidden");
    }
  }
}

if (cepInput) {
  cepInput.addEventListener("input", () => {
    cepInput.value = cepInput.value
      .replace(/\D/g, "")
      .replace(/^(\d{5})(\d)/, "$1-$2")
      .slice(0, 9);

    const cep = cepInput.value.replace(/\D/g, "");

    if (cep.length < 8) {
      clearDeliveryFields();
      hideAddressWarning();
      lastFetchedCep = "";

      if (cepLoading) {
        cepLoading.classList.add("hidden");
      }

      return;
    }

    if (cep.length === 8) {
      fetchAddressByCep();
    }
  });
}

if (houseNumberInput) {
  houseNumberInput.addEventListener("input", () => {
    houseNumberInput.value = houseNumberInput.value.replace(/\D/g, "");
    hideAddressWarning();
  });
}

if (complementInput) {
  complementInput.addEventListener("input", hideAddressWarning);
}

// ===== VALIDAÇÃO =====
function validateAddressFields() {
  const cep = cepInput ? cepInput.value.replace(/\D/g, "") : "";
  const number = houseNumberInput ? houseNumberInput.value.trim() : "";
  const street = streetInput ? streetInput.value.trim() : "";
  const neighborhood = neighborhoodInput ? neighborhoodInput.value.trim() : "";
  const city = cityInput ? cityInput.value.trim() : "";

  if (isFetchingCep) {
    showAddressWarning("Aguarde a busca do CEP terminar.");
    return false;
  }

  if (cep.length !== 8 || street === "" || neighborhood === "" || city === "") {
    showAddressWarning(
      "Preencha os campos obrigatórios e informe um CEP válido para carregar o endereço."
    );
    return false;
  }

  if (!isValidHouseNumber(number)) {
    showAddressWarning("Informe um número válido usando apenas dígitos.");
    return false;
  }

  hideAddressWarning();
  return true;
}

// ===== REVIEW =====
function loadReview() {
  if (!reviewItems || !reviewAddress || !reviewTotal) return;

  reviewItems.innerHTML = "";

  if (cart.length === 0) {
    reviewItems.innerHTML = `<p class="text-zinc-500 italic">Nenhum item no pedido.</p>`;
    reviewAddress.textContent = "Endereço não informado.";
    reviewTotal.textContent = formatPrice(0);
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

    reviewItems.appendChild(itemRow);
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

  reviewItems.appendChild(summaryDiv);

  reviewAddress.textContent = getAddressText();
  reviewTotal.textContent = formatPrice(totalWithDelivery);
}

// ===== FINALIZAR =====
if (finishOrderBtn) {
  finishOrderBtn.onclick = () => {
    if (isFinishingOrder) return;

    if (cart.length === 0) {
      showToast("Seu carrinho está vazio.");
      return;
    }

    if (!isStoreOpenNow()) {
      showClosedStoreMessage();
      return;
    }

    if (!validateAddressFields()) {
      openModal(addressModal);
      return;
    }

    isFinishingOrder = true;
    setFinishButtonLoading(true);

    const addressText = getAddressText();
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

    const phoneNumber = "5564999244855";
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");

    setTimeout(() => {
      clearCartAfterOrder();
      resetAddressForm();
      closeAllModals();
      setFinishButtonLoading(false);
      isFinishingOrder = false;
      showToast("Pedido enviado! Seu carrinho foi limpo.", "#16a34a");
    }, 900);
  };
}

// ===== STATUS =====
function updateStoreStatus() {
  const isOpen = isStoreOpenNow();

  if (!dateSpan || !statusText) return;

  if (isOpen) {
    dateSpan.classList.remove("badge-closed");
    dateSpan.classList.add("badge-open");
    statusText.textContent = "Aberto agora";
  } else {
    dateSpan.classList.remove("badge-open");
    dateSpan.classList.add("badge-closed");
    statusText.textContent = "Fechado no momento";
  }
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  renderMenu();
  hideCartFooter();
  bindAddToCartButtons();
  updateCart();
  updateStoreStatus();
  setupCartVisibility();
  revealOnScroll();
});

window.addEventListener("scroll", revealOnScroll);