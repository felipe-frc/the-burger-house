export const statusLabels = {
  PendingPayment: "Aguardando pagamento",
  Received: "Pedido recebido",
  Preparing: "Em preparo",
  ReadyForPickup: "Pronto",
  OutForDelivery: "Saiu para entrega",
  Completed: "Concluído",
  Cancelled: "Cancelado",
  Pending: "Pendente",
  Approved: "Aprovado",
  Rejected: "Recusado",
  Refunded: "Estornado",
  PartiallyRefunded: "Estornado parcialmente",
  ChargedBack: "Contestação",
};
export const methodLabels = {
  Pix: "PIX",
  CreditCard: "Crédito",
  DebitCard: "Débito",
  AccountMoney: "Saldo em conta",
  PrepaidCard: "Pré-pago",
  Unknown: "Não informado",
};
export const money = (value) =>
  value == null
    ? "Não disponível"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const dateTime = (value) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(/[Z+-]\d*:?\d*$/.test(value) ? value : `${value}Z`));
export function nextStatus(status, type) {
  if (status === "Received") return "Preparing";
  if (status === "Preparing") return "ReadyForPickup";
  if (status === "ReadyForPickup")
    return type === "delivery" ? "OutForDelivery" : type === "pickup" ? "Completed" : null;
  if (status === "OutForDelivery" && type === "delivery") return "Completed";
  return null;
}
export function createPoller(task, delay = 15000) {
  let timer,
    running = false,
    enabled = false;
  async function tick() {
    if (!enabled || running) return;
    running = true;
    try {
      await task();
    } finally {
      running = false;
      if (enabled) timer = setTimeout(tick, delay);
    }
  }
  return {
    start() {
      if (!enabled) {
        enabled = true;
        timer = setTimeout(tick, delay);
      }
    },
    stop() {
      enabled = false;
      clearTimeout(timer);
    },
  };
}
export function createOrderNotifier(storage = globalThis.sessionStorage) {
  const key = "burger-owner-order-states";
  let seen = new Map();
  let initialized = false;
  try {
    const saved = JSON.parse(storage.getItem(key) || "null");
    if (Array.isArray(saved)) {
      seen = new Map(
        saved
          .filter(
            ([id, state]) =>
              Number.isSafeInteger(id) &&
              id > 0 &&
              state &&
              Object.hasOwn(statusLabels, state.status),
          )
          .map(([id, state]) => [
            id,
            {
              status: state.status,
              paymentStatus: Object.hasOwn(statusLabels, state.paymentStatus)
                ? state.paymentStatus
                : null,
            },
          ]),
      );
      initialized = true;
    }
  } catch {
    /* Storage may be disabled or invalid; use memory. */
  }
  return {
    detect(orders) {
      const added = [];
      for (const order of orders) {
        if (
          !Number.isSafeInteger(order.id) ||
          order.id <= 0 ||
          !Object.hasOwn(statusLabels, order.status)
        )
          continue;
        const previous = seen.get(order.id);
        let title, message, category;
        if (initialized) {
          if (order.paymentStatus === "Approved" && previous?.paymentStatus !== "Approved") {
            title = "Pagamento aprovado";
            category = "payments";
            message = `${Object.hasOwn(methodLabels, order.paymentMethod) ? methodLabels[order.paymentMethod] : "Pagamento"} • ${money(Number.isFinite(order.total) ? order.total : null)}`;
          } else if (!previous && order.paymentStatus === "Pending") {
            title = "Aguardando pagamento";
            category = "orders";
            message = "Novo pedido recebido.";
          } else if (previous && previous.status !== order.status) {
            title = "Status atualizado";
            category = "status";
            message = statusLabels[order.status];
          }
        }
        if (title)
          added.push({
            orderId: order.id,
            title,
            message,
            category,
            time: new Date().toISOString(),
          });
        // Explicit projection: never retain customer fields or provider identifiers.
        seen.set(order.id, {
          status: order.status,
          paymentStatus: Object.hasOwn(statusLabels, order.paymentStatus)
            ? order.paymentStatus
            : null,
        });
      }
      initialized = true;
      try {
        storage.setItem(key, JSON.stringify([...seen]));
      } catch {
        /* Memory still prevents repeat alerts. */
      }
      return added;
    },
    clear() {
      seen.clear();
      initialized = false;
      try {
        storage.removeItem(key);
        storage.removeItem("burger-owner-seen-orders");
      } catch {
        /* No stored session. */
      }
    },
  };
}
