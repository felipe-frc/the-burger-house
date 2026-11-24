export type CartProduct = {
  id: string;
  code: string;
  name: string;
  price: number;
  image: string;
  imageAlt: string;
  available: boolean;
};

export type CartItem = CartProduct & { quantity: number; extras?: { code: string; quantity: number }[]; observation?: string };
