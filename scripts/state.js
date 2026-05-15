const CART_STORAGE_KEY = "cart";
const ORDER_TYPE_STORAGE_KEY = "orderType";

export const ORDER_TYPES = {
  DELIVERY: "delivery",
  PICKUP: "pickup",
};

let cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
let orderType = localStorage.getItem(ORDER_TYPE_STORAGE_KEY) || ORDER_TYPES.DELIVERY;

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
  localStorage.removeItem(CART_STORAGE_KEY);
}

export function getOrderType() {
  return orderType;
}

export function setOrderType(newOrderType) {
  if (!Object.values(ORDER_TYPES).includes(newOrderType)) {
    orderType = ORDER_TYPES.DELIVERY;
  } else {
    orderType = newOrderType;
  }

  localStorage.setItem(ORDER_TYPE_STORAGE_KEY, orderType);
}

export function resetOrderType() {
  setOrderType(ORDER_TYPES.DELIVERY);
}
