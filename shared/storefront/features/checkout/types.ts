import type { CartItem } from "../../lib/cart-types";

export type FulfillmentType = "delivery" | "pickup";

export type CheckoutForm = {
  fulfillment: FulfillmentType;
  customerName: string;
  phone: string;
  email: string;
  cpf: string;
  zipCode: string;
  street: string;
  houseNumber: string;
  neighborhood: string;
  city: string;
  complement: string;
  observation: string;
};

export type CheckoutSession = {
  version: 1;
  orderId: number;
  orderAccessToken?: string;
  paymentId: number;
  checkoutUrl?: string;
  cartApplied?: boolean;
  fulfillment: FulfillmentType;
  discount?: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: Pick<CartItem, "code" | "name" | "quantity">[];
  createdAt: string;
};

export const emptyCheckoutForm: CheckoutForm = {
  fulfillment: "delivery",
  customerName: "",
  phone: "",
  email: "",
  cpf: "",
  zipCode: "",
  street: "",
  houseNumber: "",
  neighborhood: "",
  city: "",
  complement: "",
  observation: "",
};
