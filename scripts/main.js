import {
  bindAddressEvents,
  updateOrderTypeUI,
} from "./address.js";
import { bindAddToCartButtons, bindCartControls, updateCart } from "./cart.js";
import {
  applyStaticTranslations,
  bindLanguageSwitcher,
  getCurrentLanguage,
} from "./i18n.js";
import { bindOrderEvents } from "./order.js";
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

document.addEventListener("DOMContentLoaded", () => {
  applyStaticTranslations(getCurrentLanguage());
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
