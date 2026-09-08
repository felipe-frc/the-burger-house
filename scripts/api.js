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

export async function createOrder(orderType, items) {
  return request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      orderType,
      items,
    }),
  });
}

export async function createPayment(orderId, idempotencyKey) {
  return request("/api/payments", {
    method: "POST",
    body: JSON.stringify({
      orderId,
      idempotencyKey,
    }),
  });
}

export async function processCardPayment(
  paymentId,
  { paymentToken, paymentMethodId, installments, payerEmail },
) {
  return request(`/api/payments/${paymentId}/card`, {
    method: "POST",
    body: JSON.stringify({
      paymentToken,
      paymentMethodId,
      installments,
      payerEmail,
    }),
  });
}
