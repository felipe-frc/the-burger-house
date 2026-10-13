import { bindAddressEvents, updateOrderTypeUI } from "./address.js";
import { getPublicProducts } from "./api.js";
import { reconcileCartWithCatalog } from "./cart-service.js";
import { applyPublicCatalog } from "./data.js";
import { getCart, setCart } from "./state.js";
import { bindAddToCartButtons, bindCartControls, updateCart } from "./cart.js";
import { applyStaticTranslations, bindLanguageSwitcher, getCurrentLanguage } from "./i18n.js";
import { bindOrderEvents, resumeCheckoutReturn } from "./order.js";
import {
  bindModalCloseEvents,
  hideCartFooter,
  renderMenu,
  revealOnScroll,
  setupCartVisibility,
  setupCategoryNavigation,
  updateStoreStatus,
} from "./ui.js";

function refreshLocalizedUI() {
  renderMenu();
  updateCart();
  updateStoreStatus();
  updateOrderTypeUI();
  setupCategoryNavigation();
  revealOnScroll();
}

document.addEventListener("DOMContentLoaded", async () => {
  applyStaticTranslations(getCurrentLanguage());

  try {
    const catalog = await getPublicProducts();

    applyPublicCatalog(catalog);

    setCart(
      reconcileCartWithCatalog(
        getCart(),
        catalog,
      ),
    );
  } catch (error) {
    console.error(
      "Nao foi possivel sincronizar o catalogo publico.",
      error,
    );
  }

  renderMenu();

  hideCartFooter();
  bindModalCloseEvents();

  bindAddToCartButtons();
  bindCartControls();

  bindAddressEvents();
  bindOrderEvents();

  bindLanguageSwitcher(() => {
    refreshLocalizedUI();
  });

  updateCart();
  updateStoreStatus();
  setupCartVisibility();
  setupCategoryNavigation();
  revealOnScroll();
});

window.addEventListener("scroll", revealOnScroll);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void resumeCheckoutReturn();
});
