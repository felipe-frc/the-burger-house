import { bindAddressEvents } from "./address.js";
import { bindAddToCartButtons, bindCartControls, updateCart } from "./cart.js";
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

document.addEventListener("DOMContentLoaded", () => {
  renderMenu();

  hideCartFooter();
  bindModalCloseEvents();

  bindAddToCartButtons();
  bindCartControls();

  bindAddressEvents();
  bindOrderEvents();

  updateCart();
  updateStoreStatus();
  setupCartVisibility();
  setupCategoryNavigation();
  revealOnScroll();
});

window.addEventListener("scroll", revealOnScroll);