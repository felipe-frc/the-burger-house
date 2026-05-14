const CART_STORAGE_KEY = "cart";

let cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];

export function getCart() {
  return cart;
}

export function setCart(newCart) {
  cart = newCart;
  saveCart();
}

export function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

export function clearCart() {
  cart = [];
  saveCart();
}