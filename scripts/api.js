import { API_BASE_URL } from "./config.js";

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  let data = null;

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    const message = data?.error ?? `A API retornou o status ${response.status}.`;

    throw new ApiError(message, response.status, data);
  }

  return data;
}

export async function getPublicProducts() {
  return request("/api/products", {
    method: "GET",
  });
}
export async function createOrder(orderPayload) {
  return request("/api/orders", {
    method: "POST",

    body: JSON.stringify(orderPayload),
  });
}

function orderAccessHeaders(token) {
  if (typeof token !== "string" || !token || token.length > 2048)
    throw new ApiError("Comprovante de acesso ausente. Preserve o pedido e solicite verificação.", 0);
  return { "X-Order-Access": token };
}
export async function createCheckout(orderId, token) {
  return request(`/api/checkout/${orderId}`, { method: "POST", headers: orderAccessHeaders(token) });
}

export async function getPaymentStatus(paymentId, token) {
  return request(`/api/payments/${paymentId}`, {
    method: "GET",
    headers: orderAccessHeaders(token),
  });
}
