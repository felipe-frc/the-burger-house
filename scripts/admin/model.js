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
  const key = "burger-owner-seen-orders";
  let seen;
  try {
    seen = new Set(JSON.parse(storage.getItem(key) || "null"));
  } catch {
    seen = new Set();
  }
  let initialized = false;
  try {
    initialized = storage.getItem(key) !== null;
  } catch {
    /* Storage may be disabled. */
  }
  return {
    detect(orders) {
      const paid = orders.filter((o) => o.status === "Received" && o.paymentStatus === "Approved");
      const added = initialized ? paid.filter((o) => !seen.has(o.id)) : [];
      paid.forEach((o) => seen.add(o.id));
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
      } catch {
        /* No stored session. */
      }
    },
  };
}
