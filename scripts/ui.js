import { MENU_CATEGORIES } from "./data.js";
import { escapeHTML, formatPrice, isStoreOpenNow } from "./utils.js";

let activeModal = null;
let previouslyFocusedElement = null;

export const elements = {
  get menuSection() {
    return document.getElementById("menu");
  },
  menuCategoriesContainer: document.getElementById("menu-categories"),

  cartModal: document.getElementById("cart-modal"),
  addressModal: document.getElementById("address-modal"),
  reviewModal: document.getElementById("review-modal"),

  cartBtn: document.getElementById("cart-btn"),
  cartFooter: document.querySelector(".cart-footer"),

  closeModalBtn: document.getElementById("close-modal-btn"),
  goToAddressBtn: document.getElementById("go-to-address-btn"),
  backToCartBtn: document.getElementById("back-to-cart-btn"),
  goToReviewBtn: document.getElementById("go-to-review-btn"),
  backToAddressBtn: document.getElementById("back-to-address-btn"),
  finishOrderBtn: document.getElementById("finish-order-btn"),

  cartItemsContainer: document.getElementById("cart-items"),
  cartTotal: document.getElementById("cart-total"),
  cartCount: document.getElementById("cart-count"),

  cepInput: document.getElementById("cep"),
  streetInput: document.getElementById("street"),
  neighborhoodInput: document.getElementById("neighborhood"),
  cityInput: document.getElementById("city"),
  houseNumberInput: document.getElementById("house-number"),
  complementInput: document.getElementById("complement"),
  addressWarn: document.getElementById("address-warn"),
  cepLoading: document.getElementById("cep-loading"),

  reviewItems: document.getElementById("review-items"),
  reviewAddress: document.getElementById("review-address"),
  reviewTotal: document.getElementById("review-total"),

  dateSpan: document.getElementById("date-span"),
  statusText: document.getElementById("status-text"),
};

function getFocusableElements(container) {
  if (!container) return [];

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll(focusableSelector)).filter(
    (element) =>
      element.offsetParent !== null || element === document.activeElement
  );
}

function focusFirstElement(modal) {
  const focusableElements = getFocusableElements(modal);

  if (focusableElements.length > 0) {
    focusableElements[0].focus();
    return;
  }

  modal.setAttribute("tabindex", "-1");
  modal.focus();
}

function trapFocus(event) {
  if (!activeModal || event.key !== "Tab") return;

  const focusableElements = getFocusableElements(activeModal);

  if (focusableElements.length === 0) {
    event.preventDefault();
    activeModal.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

export function openModal(modal) {
  closeAllModals(false);

  if (!modal) return;

  previouslyFocusedElement = document.activeElement;
  activeModal = modal;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    focusFirstElement(modal);
  });
}

export function closeAllModals(restoreFocus = true) {
  if (elements.cartModal) elements.cartModal.classList.add("hidden");
  if (elements.addressModal) elements.addressModal.classList.add("hidden");
  if (elements.reviewModal) elements.reviewModal.classList.add("hidden");

  document.body.style.overflow = "";
  activeModal = null;

  if (
    restoreFocus &&
    previouslyFocusedElement &&
    typeof previouslyFocusedElement.focus === "function"
  ) {
    previouslyFocusedElement.focus();
  }

  previouslyFocusedElement = null;
}

export function bindModalCloseEvents() {
  document.querySelectorAll(".close-modal-x").forEach((button) => {
    button.addEventListener("click", () => closeAllModals());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
      return;
    }

    trapFocus(event);
  });

  [elements.cartModal, elements.addressModal, elements.reviewModal].forEach(
    (modal) => {
      if (!modal) return;

      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeAllModals();
        }
      });
    }
  );
}

export function showToast(message, background = "#ef4444") {
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

export function showClosedStoreMessage() {
  showToast("Estamos fechados no momento. Funcionamos das 18h às 23h.");
}

export function showAddressWarning(message) {
  if (!elements.addressWarn) return;

  elements.addressWarn.textContent = message;
  elements.addressWarn.classList.remove("hidden");
}

export function hideAddressWarning() {
  if (!elements.addressWarn) return;

  elements.addressWarn.classList.add("hidden");
}

export function setFinishButtonLoading(isLoading) {
  const button = elements.finishOrderBtn;

  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.dataset.originalHtml = button.innerHTML;
    button.classList.add("opacity-80", "cursor-not-allowed");
    button.innerHTML = `
      <span class="inline-flex items-center gap-2">
        <span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        Enviando pedido...
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

export function renderMenu() {
  if (!elements.menuCategoriesContainer) return;

  elements.menuCategoriesContainer.innerHTML = MENU_CATEGORIES.map(
    renderMenuCategory
  ).join("");
}

function renderMenuCategory(category) {
  return `
    <section id="${escapeHTML(category.id)}" class="max-w-5xl mx-auto px-4 scroll-mt-28">
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

function renderProductCard(product) {
  const tagHTML = product.tag
    ? `<span class="product-item-tag">${escapeHTML(product.tag)}</span>`
    : "";

  const imageAlt = product.imageAlt || product.name;

  return `
    <article class="product-item-card reveal">
      <div class="product-item-img-wrapper">
        <img
          src="${escapeHTML(product.image)}"
          alt="${escapeHTML(imageAlt)}"
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
    </article>
  `;
}

export function updateStoreStatus() {
  const isOpen = isStoreOpenNow();

  if (!elements.dateSpan || !elements.statusText) return;

  if (isOpen) {
    elements.dateSpan.classList.remove("badge-closed");
    elements.dateSpan.classList.add("badge-open");
    elements.statusText.textContent = "Aberto agora";
  } else {
    elements.dateSpan.classList.remove("badge-open");
    elements.dateSpan.classList.add("badge-closed");
    elements.statusText.textContent = "Fechado no momento";
  }
}

export function revealOnScroll() {
  const reveals = document.querySelectorAll(".reveal");
  const windowHeight = window.innerHeight;

  reveals.forEach((element) => {
    const elementTop = element.getBoundingClientRect().top;

    if (elementTop < windowHeight - 100) {
      element.classList.add("active");
    }
  });
}

export function showFloatingCart() {
  if (!elements.cartFooter) return;

  elements.cartFooter.classList.remove(
    "cart-footer-hidden",
    "cart-footer-bottom"
  );
  elements.cartFooter.classList.add("cart-footer-visible");
}

export function showBottomCart() {
  if (!elements.cartFooter) return;

  elements.cartFooter.classList.remove("cart-footer-hidden");
  elements.cartFooter.classList.add("cart-footer-visible", "cart-footer-bottom");
}

export function hideCartFooter() {
  if (!elements.cartFooter) return;

  elements.cartFooter.classList.remove(
    "cart-footer-visible",
    "cart-footer-bottom"
  );
  elements.cartFooter.classList.add("cart-footer-hidden");
}

export function setupCartVisibility() {
  const menuSection = elements.menuSection;
  const categoryNav = document.getElementById("category-nav");

  if (!menuSection) return;

  function updateCartVisibility() {
    const navHeight = categoryNav ? categoryNav.offsetHeight : 0;
    const menuStart = Math.max(menuSection.offsetTop - navHeight - 160, 0);

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

  window.addEventListener("scroll", updateCartVisibility, {
    passive: true,
  });

  window.addEventListener("resize", updateCartVisibility);
}

export function setupCategoryNavigation() {
  const nav = document.getElementById("category-nav");
  const navLinks = Array.from(document.querySelectorAll("[data-category-link]"));
  const sections = ["menu", "sides", "drinks"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!nav || navLinks.length === 0 || sections.length === 0) return;

  let isClickScrolling = false;
  let clickScrollTimeout = null;
  let scrollFrame = null;

  function setActiveLink(sectionId) {
    navLinks.forEach((link) => {
      const isActive = link.dataset.categoryLink === sectionId;

      link.classList.toggle("active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function isNearPageBottom() {
    const scrollPosition = window.scrollY + window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;

    return scrollPosition >= pageHeight - 80;
  }

  function getCurrentSectionId() {
    if (isNearPageBottom()) {
      return sections[sections.length - 1].id;
    }

    const navHeight = nav.offsetHeight || 0;
    const referenceLine = navHeight + 140;

    let currentSectionId = sections[0].id;

    sections.forEach((section) => {
      const sectionTop = section.getBoundingClientRect().top;

      if (sectionTop <= referenceLine) {
        currentSectionId = section.id;
      }
    });

    return currentSectionId;
  }

  function updateActiveLinkOnScroll() {
    if (isClickScrolling) return;

    if (scrollFrame) {
      window.cancelAnimationFrame(scrollFrame);
    }

    scrollFrame = window.requestAnimationFrame(() => {
      setActiveLink(getCurrentSectionId());
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();

      const sectionId = link.dataset.categoryLink;
      const section = sectionId ? document.getElementById(sectionId) : null;

      if (!section) return;

      const navHeight = nav.offsetHeight || 0;
      const targetPosition = Math.max(section.offsetTop - navHeight - 24, 0);

      isClickScrolling = true;
      setActiveLink(sectionId);

      window.scrollTo({
        top: targetPosition,
        behavior: "smooth",
      });

      if (clickScrollTimeout) {
        window.clearTimeout(clickScrollTimeout);
      }

      clickScrollTimeout = window.setTimeout(() => {
        setActiveLink(getCurrentSectionId());
        isClickScrolling = false;
      }, 900);
    });
  });

  setActiveLink(getCurrentSectionId());

  window.addEventListener("scroll", updateActiveLinkOnScroll, {
    passive: true,
  });

  window.addEventListener("resize", updateActiveLinkOnScroll);
}
