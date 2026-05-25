import { DELIVERY_FEE } from "./config.js";
import { MENU_PRODUCT_BY_ID } from "./data.js";
import { getCart, getOrderType, ORDER_TYPES } from "./state.js";

export function findProductById(productId) {
  return MENU_PRODUCT_BY_ID.get(productId);
}

export function getCartSubtotal(cart = getCart()) {
  return cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
}

export function getDeliveryFee(cart = getCart(), orderType = getOrderType()) {
  return cart.length > 0 && orderType === ORDER_TYPES.DELIVERY
    ? DELIVERY_FEE
    : 0;
}

export function getCartTotalWithDelivery(
  cart = getCart(),
  orderType = getOrderType()
) {
  return getCartSubtotal(cart) + getDeliveryFee(cart, orderType);
}

export function getCartItemCount(cart = getCart()) {
  return cart.reduce((acc, item) => acc + item.quantity, 0);
}

export function addProductToCart(cart, product) {
  if (!product) return cart;

  const existingItem = cart.find((item) => item.id === product.id);

  if (existingItem) {
    return cart.map((item) =>
      item.id === product.id
        ? {
            ...item,
            quantity: item.quantity + 1,
          }
        : item
    );
  }

  return [
    ...cart,
    {
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
    },
  ];
}

export function removeProductFromCart(cart, productId) {
  return cart.filter((item) => item.id !== productId);
}

export function increaseCartItemQuantity(cart, productId) {
  return cart.map((item) =>
    item.id === productId
      ? {
          ...item,
          quantity: item.quantity + 1,
        }
      : item
  );
}

export function decreaseCartItemQuantity(cart, productId) {
  return cart
    .map((item) =>
      item.id === productId
        ? {
            ...item,
            quantity: item.quantity - 1,
          }
        : item
    )
    .filter((item) => item.quantity > 0);
}