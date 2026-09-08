import { loadMercadoPago } from "@mercadopago/sdk-js";

let mercadoPagoPromise = null;

async function initializeMercadoPago() {
  const publicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY?.trim();

  if (!publicKey) {
    throw new Error("A Public Key do Mercado Pago não foi configurada.");
  }

  await loadMercadoPago();

  if (!window.MercadoPago) {
    throw new Error("Não foi possível carregar o SDK do Mercado Pago.");
  }

  return new window.MercadoPago(publicKey);
}

export function getMercadoPago() {
  if (!mercadoPagoPromise) {
    mercadoPagoPromise = initializeMercadoPago();
  }

  return mercadoPagoPromise;
}
