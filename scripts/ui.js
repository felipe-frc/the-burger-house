import { TOAST_DURATION_MS } from "./config.js";
import { MENU_CATEGORIES } from "./data.js";
import { getLocalizedEntity, translate } from "./i18n.js";
import { escapeHTML, formatPrice, isStoreOpenNow } from "./utils.js";

/**
 * @typedef {{
 *   text: string,
 *   duration: number,
 *   gravity: string,
 *   position: string,
 *   stopOnFocus: boolean,
 *   style: {
 *     background: string,
 *     color: string,
 *     borderRadius: string
 *   }
 * }} ToastifyOptions
 */

/**
 * @typedef {{
 *   showToast: () => void
 * }} ToastifyInstance
 */

/**
 * @typedef {(options: ToastifyOptions) => ToastifyInstance} ToastifyFactory
 */

/** @type {HTMLElement | null} */
let activeModal = null;

/** @type {HTMLElement | null} */
let previouslyFocusedElement = null;

/** @type {(() => void) | null} */
let cleanupCategoryNavigation = null;

export const elements = {
  get menuSection() {
    return document.getElementById("menu");
  },

  menuCategoriesContainer: /** @type {HTMLElement | null} */ (
    document.getElementById("menu-categories")
  ),

  cartModal: /** @type {HTMLElement | null} */ (document.getElementById("cart-modal")),

  addressModal: /** @type {HTMLElement | null} */ (document.getElementById("address-modal")),

  reviewModal: /** @type {HTMLElement | null} */ (document.getElementById("review-modal")),

  paymentModal: /** @type {HTMLElement | null} */ (document.getElementById("payment-modal")),

  cartBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById("cart-btn")),

  cartFooter: /** @type {HTMLElement | null} */ (document.querySelector(".cart-footer")),

  closeModalBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("close-modal-btn")
  ),

  goToAddressBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("go-to-address-btn")
  ),

  backToCartBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("back-to-cart-btn")
  ),

  goToReviewBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("go-to-review-btn")
  ),

  backToAddressBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("back-to-address-btn")
  ),

  goToPaymentBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("go-to-payment-btn")
  ),

  backToReviewBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("back-to-review-btn")
  ),

  finishOrderBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("finish-order-btn")
  ),

  paymentForm: /** @type {HTMLFormElement | null} */ (document.getElementById("form-checkout")),

  paymentSubmitBtn: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("form-checkout__submit")
  ),

  paymentTotal: /** @type {HTMLElement | null} */ (document.getElementById("payment-total")),

  paymentError: /** @type {HTMLElement | null} */ (document.getElementById("payment-error")),

  paymentProgress: /** @type {HTMLProgressElement | null} */ (
    document.getElementById("payment-progress")
  ),

  paymentCardholderName: /** @type {HTMLInputElement | null} */ (
    document.getElementById("form-checkout__cardholderName")
  ),

  paymentIdentificationType: /** @type {HTMLSelectElement | null} */ (
    document.getElementById("form-checkout__identificationType")
  ),

  paymentIdentificationNumber: /** @type {HTMLInputElement | null} */ (
    document.getElementById("form-checkout__identificationNumber")
  ),

  paymentEmail: /** @type {HTMLInputElement | null} */ (
    document.getElementById("form-checkout__cardholderEmail")
  ),

  paymentInstallments: /** @type {HTMLSelectElement | null} */ (
    document.getElementById("form-checkout__installments")
  ),

  paymentIssuer: /** @type {HTMLSelectElement | null} */ (
    document.getElementById("form-checkout__issuer")
  ),

  cartItemsContainer: /** @type {HTMLElement | null} */ (document.getElementById("cart-items")),

  cartTotal: /** @type {HTMLElement | null} */ (document.getElementById("cart-total")),

  cartCount: /** @type {HTMLElement | null} */ (document.getElementById("cart-count")),

  cepInput: /** @type {HTMLInputElement | null} */ (document.getElementById("cep")),

  streetInput: /** @type {HTMLInputElement | null} */ (document.getElementById("street")),

  neighborhoodInput: /** @type {HTMLInputElement | null} */ (
    document.getElementById("neighborhood")
  ),

  cityInput: /** @type {HTMLInputElement | null} */ (document.getElementById("city")),

  houseNumberInput: /** @type {HTMLInputElement | null} */ (
    document.getElementById("house-number")
  ),

  complementInput: /** @type {HTMLInputElement | null} */ (document.getElementById("complement")),

  addressWarn: /** @type {HTMLElement | null} */ (document.getElementById("address-warn")),

  cepLoading: /** @type {HTMLElement | null} */ (document.getElementById("cep-loading")),

  reviewItems: /** @type {HTMLElement | null} */ (document.getElementById("review-items")),

  reviewAddress: /** @type {HTMLElement | null} */ (document.getElementById("review-address")),

  reviewTotal: /** @type {HTMLElement | null} */ (document.getElementById("review-total")),

  orderNotesInput: /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("order-notes")
  ),

  orderTypeInputs: /** @type {NodeListOf<HTMLInputElement>} */ (
    document.querySelectorAll("input[name='order-type']")
  ),

  deliveryFields: /** @type {HTMLElement | null} */ (document.getElementById("delivery-fields")),

  pickupInfo: /** @type {HTMLElement | null} */ (document.getElementById("pickup-info")),

  dateSpan: /** @type {HTMLElement | null} */ (document.getElementById("date-span")),

  statusText: /** @type {HTMLElement | null} */ (document.getElementById("status-text")),
};

/**
 * @returns {ToastifyFactory | undefined}
 */
function getToastify() {
  return /** @type {typeof globalThis & { Toastify?: ToastifyFactory }} */ (globalThis).Toastify;
}

/**
 * @param {HTMLElement | null} container
 * @returns {HTMLElement[]}
 */
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

  const focusableElements = /** @type {NodeListOf<HTMLElement>} */ (
    container.querySelectorAll(focusableSelector)
  );

  return Array.from(focusableElements).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * @param {HTMLElement} modal
 */
function focusFirstElement(modal) {
  const focusableElements = getFocusableElements(modal);

  if (focusableElements.length > 0) {
    focusableElements[0].focus();
    return;
  }

  modal.setAttribute("tabindex", "-1");
  modal.focus();
}

/**
 * @param {KeyboardEvent} event
 */
function trapFocus(event) {
  if (!activeModal || event.key !== "Tab") {
    return;
  }

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

/**
 * @param {HTMLElement | null} modal
 */
export function openModal(modal) {
  closeAllModals(false);

  if (!modal) return;

  previouslyFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  activeModal = modal;

  modal.classList.remove("hidden");

  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    focusFirstElement(modal);
  });
}

/**
 * @param {boolean} [restoreFocus]
 */
export function closeAllModals(restoreFocus = true) {
  if (elements.cartModal) {
    elements.cartModal.classList.add("hidden");
  }

  if (elements.addressModal) {
    elements.addressModal.classList.add("hidden");
  }

  if (elements.reviewModal) {
    elements.reviewModal.classList.add("hidden");
  }

  if (elements.paymentModal) {
    elements.paymentModal.classList.add("hidden");
  }

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

  [elements.cartModal, elements.addressModal, elements.reviewModal, elements.paymentModal].forEach(
    (modal) => {
      if (!modal) return;

      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeAllModals();
        }
      });
    },
  );
}

/**
 * @param {string} message
 * @param {string} [background]
 */
export function showToast(message, background = "#ef4444") {
  const toastify = getToastify();

  if (!toastify) {
    console.error("Toastify não carregado:", message);

    return;
  }

  toastify({
    text: message,
    duration: TOAST_DURATION_MS,
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
  showToast(translate("status.closedMessage"));
}

/**
 * @param {string} message
 */
export function showAddressWarning(message) {
  if (!elements.addressWarn) return;

  elements.addressWarn.textContent = message;

  elements.addressWarn.classList.remove("hidden");
}

export function hideAddressWarning() {
  if (!elements.addressWarn) return;

  elements.addressWarn.classList.add("hidden");
}

/**
 * @param {string} message
 */
export function showPaymentError(message) {
  if (!elements.paymentError) return;

  elements.paymentError.textContent = message;

  elements.paymentError.classList.remove("hidden");
}

export function hidePaymentError() {
  if (!elements.paymentError) return;

  elements.paymentError.textContent = "";

  elements.paymentError.classList.add("hidden");
}

/**
 * @param {number} total
 */
export function setPaymentTotal(total) {
  if (!elements.paymentTotal) return;

  elements.paymentTotal.textContent = formatPrice(total);
}

/**
 * @param {boolean} isProcessing
 */
export function setPaymentProcessing(isProcessing) {
  const button = elements.paymentSubmitBtn;

  const progress = elements.paymentProgress;

  if (button) {
    if (isProcessing) {
      button.disabled = true;

      button.dataset.originalHtml = button.innerHTML;

      button.classList.add("opacity-80", "cursor-not-allowed");

      button.innerHTML = `
        <span class="inline-flex items-center gap-2">
          <span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          Processando...
        </span>
      `;
    } else {
      button.disabled = false;

      button.classList.remove("opacity-80", "cursor-not-allowed");

      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
      }
    }
  }

  if (progress) {
    progress.classList.toggle("hidden", !isProcessing);

    progress.value = isProcessing ? 50 : 0;
  }
}

/**
 * @param {boolean} isLoading
 */
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
        ${translate("order.sending")}
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
  if (!elements.menuCategoriesContainer) {
    return;
  }

  elements.menuCategoriesContainer.innerHTML = MENU_CATEGORIES.map(renderMenuCategory).join("");
}

/**
 * @param {object} category
 * @param {string} category.id
 * @param {string} category.icon
 * @param {Array<object>} category.items
 * @returns {string}
 */
function renderMenuCategory(category) {
  const localizedCategory = getLocalizedEntity(category);

  return `
    <section id="${escapeHTML(category.id)}" class="max-w-5xl mx-auto px-4 scroll-mt-28">
      <div class="section-header">
        <h2 class="section-title">
          <i class="${escapeHTML(category.icon)} text-amber-500" aria-hidden="true"></i>
          <span class="section-title-text">${escapeHTML(localizedCategory.title)}</span>
        </h2>

        <p class="section-subtitle">${escapeHTML(localizedCategory.subtitle)}</p>
      </div>

      <div class="products-list-container">
        ${category.items.map(renderProductCard).join("")}
      </div>
    </section>
  `;
}

/**
 * @param {object} product
 * @param {string} product.id
 * @param {string} product.image
 * @param {number} product.price
 * @returns {string}
 */
function renderProductCard(product) {
  const localizedProduct = getLocalizedEntity(product);

  const tagHTML = localizedProduct.tag
    ? `<span class="product-item-tag">${escapeHTML(localizedProduct.tag)}</span>`
    : "";

  const imageAlt = localizedProduct.imageAlt || localizedProduct.name;

  return `
    <article class="product-item-card reveal">
      <div class="product-item-img-wrapper">
        <img
          src="${escapeHTML(product.image)}"
          alt="${escapeHTML(imageAlt)}"
          width="110"
          height="110"
          class="product-item-img"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div class="product-item-info">
        <div class="product-item-name-row">
          <h3 class="product-item-name">${escapeHTML(localizedProduct.name)}</h3>
          ${tagHTML}
        </div>

        <p class="product-item-desc">${escapeHTML(localizedProduct.description)}</p>

        <div class="product-item-footer">
          <span class="product-item-price">${formatPrice(product.price)}</span>

          <button
            type="button"
            class="btn-add-item add-to-cart-btn"
            data-id="${escapeHTML(product.id)}"
            aria-label="${escapeHTML(
              translate("cart.addAria", undefined, {
                name: localizedProduct.name,
              }),
            )}"
          >
            <span
              class="product-cart-indicator hidden"
              data-product-count="${escapeHTML(product.id)}"
            >0</span>
            <i class="fa fa-plus" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

export function updateStoreStatus() {
  const isOpen = isStoreOpenNow();

  if (!elements.dateSpan || !elements.statusText) {
    return;
  }

  elements.dateSpan.classList.remove(
    "text-white",
    "text-zinc-50",
    "text-emerald-400",
    "text-emerald-300",
    "text-emerald-200",
    "text-rose-400",
    "text-red-400",
    "text-red-200",
    "badge-open",
    "badge-closed",
  );

  if (isOpen) {
    elements.dateSpan.classList.add("text-emerald-400");

    elements.statusText.textContent = translate("status.open");

    return;
  }

  elements.dateSpan.classList.add("text-rose-400");

  elements.statusText.textContent = translate("status.closed");
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

function showFloatingCart() {
  if (!elements.cartFooter) return;

  elements.cartFooter.classList.remove("cart-footer-hidden", "cart-footer-bottom");

  elements.cartFooter.classList.add("cart-footer-visible");
}

function showBottomCart() {
  if (!elements.cartFooter) return;

  elements.cartFooter.classList.remove("cart-footer-hidden");

  elements.cartFooter.classList.add("cart-footer-visible", "cart-footer-bottom");
}

export function hideCartFooter() {
  if (!elements.cartFooter) return;

  elements.cartFooter.classList.remove("cart-footer-visible", "cart-footer-bottom");

  elements.cartFooter.classList.add("cart-footer-hidden");
}

export function setupCartVisibility() {
  const menuSection = elements.menuSection;

  const categoryNav = /** @type {HTMLElement | null} */ (document.getElementById("category-nav"));

  if (!menuSection || !categoryNav) {
    return;
  }

  function updateCartVisibility() {
    const navHeight = categoryNav.offsetHeight || 0;

    const categoryNavStart = Math.max(categoryNav.offsetTop - navHeight, 0);

    const pageBottomThreshold = document.documentElement.scrollHeight - window.innerHeight - 40;

    const hasReachedMenu = window.scrollY >= categoryNavStart;

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
  if (typeof cleanupCategoryNavigation === "function") {
    cleanupCategoryNavigation();

    cleanupCategoryNavigation = null;
  }

  const nav = /** @type {HTMLElement | null} */ (document.getElementById("category-nav"));

  const navLinks = /** @type {HTMLElement[]} */ (
    Array.from(document.querySelectorAll("[data-category-link]")).filter(
      (link) => link instanceof HTMLElement,
    )
  );

  const sections = /** @type {HTMLElement[]} */ (
    ["menu", "sides", "drinks"]
      .map((id) => document.getElementById(id))
      .filter((section) => section instanceof HTMLElement)
  );

  if (!nav || navLinks.length === 0 || sections.length === 0) {
    return;
  }

  let isClickScrolling = false;

  /** @type {number | null} */
  let clickScrollTimeout = null;

  /** @type {number | null} */
  let scrollFrame = null;

  /**
   * @type {Map<
   *   HTMLElement,
   *   (event: MouseEvent) => void
   * >}
   */
  const clickHandlers = new Map();

  /**
   * @param {string} sectionId
   */
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

    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame);
    }

    scrollFrame = window.requestAnimationFrame(() => {
      setActiveLink(getCurrentSectionId());
    });
  }

  navLinks.forEach((link) => {
    /**
     * @param {MouseEvent} event
     */
    const clickHandler = (event) => {
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

      if (clickScrollTimeout !== null) {
        window.clearTimeout(clickScrollTimeout);
      }

      clickScrollTimeout = window.setTimeout(() => {
        setActiveLink(getCurrentSectionId());

        isClickScrolling = false;
      }, 900);
    };

    clickHandlers.set(link, clickHandler);

    link.addEventListener("click", clickHandler);
  });

  setActiveLink(getCurrentSectionId());

  window.addEventListener("scroll", updateActiveLinkOnScroll, {
    passive: true,
  });

  window.addEventListener("resize", updateActiveLinkOnScroll);

  cleanupCategoryNavigation = () => {
    clickHandlers.forEach((handler, link) => {
      link.removeEventListener("click", handler);
    });

    window.removeEventListener("scroll", updateActiveLinkOnScroll);

    window.removeEventListener("resize", updateActiveLinkOnScroll);

    if (clickScrollTimeout !== null) {
      window.clearTimeout(clickScrollTimeout);
    }

    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame);
    }
  };
}
