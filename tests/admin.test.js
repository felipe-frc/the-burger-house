// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminError, createAdminClient } from "../scripts/admin/client.js";
import {
  createOrderNotifier,
  createPoller,
  nextStatus,
  money,
  dateTime,
} from "../scripts/admin/model.js";
import * as views from "../scripts/admin/views.js";
import { createAdminApp, mountAdmin } from "../scripts/admin/main.js";
import { mockData, order, detail, summary } from "./admin-fixtures.js";
let app;
beforeEach(() => {
  sessionStorage.clear();
  history.replaceState({}, "", "/admin/");
  document.body.innerHTML = '<div id="root"></div><div id="admin-message"></div>';
});
afterEach(() => {
  app?.stop();
  app = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function setup(authenticated = true) {
  let signed = authenticated;
  const request = vi.fn(async (path, options = {}) => {
    if (path === "auth/login") {
      if (options.method) signed = true;
      return { csrfToken: "test-csrf" };
    }
    if (!signed) throw new AdminError("Credenciais inválidas.", 401);
    if (path === "auth/me") return { role: "Owner", csrfToken: "test-csrf" };
    if (path === "auth/logout") {
      signed = false;
      return null;
    }
    return mockData(path);
  });
  app = createAdminApp(document.getElementById("root"), request);
  return request;
}
const submit = (selector) =>
  document
    .querySelector(selector)
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

it("client sends cookies only to same-origin admin and keeps csrf out of storage", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "synthetic" })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const api = createAdminClient(fetcher);
  await api("auth/login");
  await api("auth/logout", { method: "POST" });
  expect(fetcher.mock.calls[1][0]).toBe("/api/admin/auth/logout");
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "same-origin",
    headers: { "X-CSRF-TOKEN": "synthetic" },
    cache: "no-store",
  });
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(0);
});
it.each([400, 401, 409, 429, 500])(
  "client uses safe messages on %s without revealing response secrets",
  async (status) => {
    const api = createAdminClient(
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "secret-token internal-url" }), { status }),
        ),
    );
    try {
      await api("orders");
      throw new Error("should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AdminError);
      expect(error.status).toBe(status);
      expect(error.message).not.toContain("secret-token");
    }
  },
);
it("formats money, null coverage and São Paulo time", () => {
  expect(money(1234.5)).toContain("1.234,50");
  expect(money(null)).toBe("Não disponível");
  expect(dateTime("2026-10-05T21:00:00")).toContain("18:00");
});
it.each([
  ["Received", "delivery", "Preparing"],
  ["Preparing", "pickup", "ReadyForPickup"],
  ["ReadyForPickup", "delivery", "OutForDelivery"],
  ["ReadyForPickup", "pickup", "Completed"],
  ["OutForDelivery", "delivery", "Completed"],
  ["Completed", "delivery", null],
  ["PendingPayment", "pickup", null],
  ["ReadyForPickup", "", null],
  ["OutForDelivery", "pickup", null],
])("allows only the next transition %s %s", (status, type, next) =>
  expect(nextStatus(status, type)).toBe(next),
);
it("poller is single, nonoverlapping and stops even during pending request", async () => {
  vi.useFakeTimers();
  let finish;
  const task = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const poll = createPoller(task);
  poll.start();
  poll.start();
  await vi.advanceTimersByTimeAsync(15000);
  expect(task).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(task).toHaveBeenCalledTimes(1);
  poll.stop();
  finish();
  await flush();
  await vi.advanceTimersByTimeAsync(30000);
  expect(task).toHaveBeenCalledTimes(1);
});
it("notifies only new approved received orders, retaining ids across reloads", () => {
  const notify = createOrderNotifier();
  expect(notify.detect([order])).toEqual([]);
  const newer = { ...order, id: 109 };
  expect(notify.detect([order, newer])).toEqual([newer]);
  expect(createOrderNotifier().detect([order, newer])).toEqual([]);
  expect(notify.detect([{ ...order, id: 110, paymentStatus: "Pending" }])).toEqual([]);
  expect(sessionStorage.getItem("burger-owner-seen-orders")).not.toContain(order.customerName);
  notify.clear();
  expect(sessionStorage.length).toBe(0);
});
it("supports denied browser storage without repeated alerts", () => {
  const storage = {
    getItem() {
      throw new Error();
    },
    setItem() {
      throw new Error();
    },
    removeItem() {
      throw new Error();
    },
  };
  const notify = createOrderNotifier(storage);
  expect(notify.detect([order])).toEqual([]);
  expect(notify.detect([{ ...order, id: 109 }])).toHaveLength(1);
  expect(notify.detect([{ ...order, id: 109 }])).toEqual([]);
  notify.clear();
});
it("escapes personal text and exposes accessible chart with exact values", () => {
  expect(
    views.orderTable([{ ...order, customerName: "<img src=x onerror=alert(1)>" }]),
  ).not.toContain("<img");
  const html = views.chart([{ date: "2026-10-05", revenue: 55.9 }]);
  expect(html).toContain("55,90");
  expect(html).toContain("aria-label");
  expect(html).toContain("Ver valores por dia");
  expect(views.coverage({ ...summary, partialRefunds: 1 })).toContain("saldo desconhecido");
  expect(
    views.orderDetails({
      ...detail,
      order: { ...order, orderType: "pickup", status: "Completed" },
    }),
  ).not.toContain("advance-status");
});
it("redirects anonymous protected routes to login and shows generic invalid-login error", async () => {
  history.replaceState({}, "", "/admin/dashboard");
  const request = setup(false);
  await app.start();
  expect(location.pathname).toBe("/admin/");
  expect(document.querySelector('input[type="password"]')).not.toBeNull();
  request.mockImplementationOnce(async () => {
    throw new AdminError("Credentials", 401);
  });
  submit("#login-form");
  await flush();
  expect(document.getElementById("login-error").textContent).toBe("Credenciais inválidas.");
});
it("login succeeds, dashboard cards chart and paid badge load, then logout blocks routes", async () => {
  const request = setup(false);
  await app.start();
  submit("#login-form");
  await flush();
  expect(location.pathname).toBe("/admin/dashboard");
  expect(document.body.textContent).toContain("Faturamento hoje");
  expect(document.body.textContent).toContain("Novo pedido pago");
  expect(document.querySelectorAll(".chart-point")).toHaveLength(2);
  document.getElementById("logout").click();
  await flush();
  expect(request).toHaveBeenCalledWith("auth/logout", { method: "POST" });
  await app.go("/admin/orders");
  expect(location.pathname).toBe("/admin/");
});
it("order filtering pagination detail and sequential mutation are wired correctly", async () => {
  const request = setup();
  await app.start();
  await app.go("/admin/orders");
  document.querySelector('[name="status"]').value = "Received";
  document.querySelector('[name="search"]').value = "Cliente";
  submit("#order-filters");
  await flush();
  expect(
    request.mock.calls.some(
      ([path]) => path.includes("status=Received") && path.includes("search=Cliente"),
    ),
  ).toBe(true);
  document.querySelector('[data-page="2"]').click();
  await flush();
  expect(request.mock.calls.at(-1)[0]).toContain("page=2");
  document.querySelector('a[href="/admin/orders/108"]').click();
  await flush();
  expect(document.body.textContent).toContain("Rua Teste");
  expect(document.body.textContent).toContain("Sem cebola");
  document.getElementById("advance-status").click();
  await flush();
  expect(request).toHaveBeenCalledWith("orders/108/status", {
    method: "PATCH",
    body: { expectedStatus: "Received", status: "Preparing" },
  });
});
it("finance filters custom periods and shows methods coverage and transactions", async () => {
  const request = setup();
  await app.start();
  await app.go("/admin/finance");
  expect(document.body.textContent).toContain("Lucro bruto estimado");
  expect(document.body.textContent).toContain("PIX");
  document.querySelector('[name="period"]').value = "custom";
  submit("#period-form");
  await flush();
  expect(document.getElementById("admin-message").textContent).toContain("Informe início");
  document.querySelector('[name="start"]').value = "2026-10-01";
  document.querySelector('[name="end"]').value = "2026-10-05";
  submit("#period-form");
  await flush();
  expect(
    request.mock.calls.some(([p]) => p.includes("period=custom&start=2026-10-01&end=2026-10-05")),
  ).toBe(true);
});
it("edits only allowed product fields and shows read-only store source", async () => {
  const request = setup();
  await app.start();
  await app.go("/admin/products");
  document.querySelector('[name="price"]').value = "32";
  document.querySelector('[name="costPrice"]').value = "";
  submit("[data-product]");
  await flush();
  expect(request).toHaveBeenCalledWith("products/1", {
    method: "PATCH",
    body: { price: 32, costPrice: null, isActive: true },
  });
  expect(document.body.textContent).toContain("cardápio público");
  await app.go("/admin/store");
  expect(document.body.textContent).toContain("18h às 23h");
  expect(document.body.textContent).toContain("5,00");
});
it("mobile menu toggles accessibly and dashboard period changes", async () => {
  const request = setup();
  await app.start();
  document.getElementById("menu-toggle").click();
  await flush();
  expect(document.getElementById("menu-toggle").getAttribute("aria-expanded")).toBe("true");
  document.getElementById("menu-toggle").click();
  await flush();
  expect(document.getElementById("admin-nav").classList.contains("open")).toBe(false);
  document.querySelector('[name="period"]').value = "30d";
  submit("#period-form");
  await flush();
  expect(request).toHaveBeenCalledWith("finance/revenue?period=30d");
});
it("polling finds a new paid order once and expires sessions without timers leaking", async () => {
  vi.useFakeTimers();
  const request = setup();
  await app.start();
  request.mockImplementation(async (path) =>
    path.startsWith("notifications?")
      ? {
          until: "2026-10-05T22:00:15Z",
          nextAfterId: null,
          newPaidOrders: 2,
          items: [{ ...order, id: 109 }],
        }
      : mockData(path),
  );
  await vi.advanceTimersByTimeAsync(15000);
  expect(document.getElementById("admin-message").textContent).toContain("#109");
  document.getElementById("admin-message").textContent = "";
  await vi.advanceTimersByTimeAsync(15000);
  expect(document.getElementById("admin-message").textContent).toBe("");
  request.mockImplementation(async (path) => {
    if (path === "auth/login") return {};
    throw new AdminError("Expired", 401);
  });
  await vi.advanceTimersByTimeAsync(15000);
  await flush();
  expect(location.pathname).toBe("/admin/");
  expect(document.getElementById("admin-message").textContent).toContain("Sessão expirada");
});
it("network errors do not render raw exception details", async () => {
  const request = setup();
  request.mockRejectedValue(new Error("secret-internal-host"));
  await app.start();
  expect(document.body.textContent).not.toContain("secret-internal-host");
  expect(document.body.textContent).toContain("Não foi possível carregar");
});

it("clears private screens on pagehide and authenticates again after browser restoration", async () => {
  let signed = true;
  const request = vi.fn(async (path) => {
    if (path === "auth/login") return {};
    if (!signed) throw new AdminError("Expired", 401);
    if (path === "auth/me") return { role: "Owner" };
    return mockData(path);
  });
  const dispose = mountAdmin(document.getElementById("root"), request);
  await flush();
  expect(document.body.textContent).toContain("Cliente Teste");
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  expect(document.body.textContent).not.toContain("Cliente Teste");
  signed = false;
  window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  await flush();
  expect(location.pathname).toBe("/admin/");
  expect(document.querySelector('[name="password"]')).not.toBeNull();
  dispose();
});

it("stopping during session validation prevents stale requests from rendering private data", async () => {
  let complete;
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  app = createAdminApp(document.getElementById("root"), request);
  const pending = app.start();
  app.stop();
  complete({ role: "Owner" });
  await pending;
  expect(document.getElementById("root").textContent).toBe("");
  expect(request).toHaveBeenCalledTimes(1);
});

it("zero-sales chart preserves real zero points and exposes an honest empty state", () => {
  const points = [
    { date: "2026-10-05", revenue: 0 },
    { date: "2026-10-06", revenue: 0 },
  ];
  const original = structuredClone(points);
  document.getElementById("root").innerHTML = views.chart(points);
  expect(document.querySelector(".chart-line").getAttribute("points")).toBe("0,180 1000,180");
  expect(document.querySelectorAll(".chart-point")).toHaveLength(2);
  expect(document.body.textContent).toContain("Nenhuma venda aprovada neste período.");
  expect(document.querySelector("summary").textContent).toBe("Ver valores por dia");
  expect(points).toEqual(original);
});

it("chart without records never fabricates dates or values", () => {
  document.getElementById("root").innerHTML = views.chart([]);
  expect(document.querySelectorAll(".chart-point, tbody tr")).toHaveLength(0);
  expect(document.body.textContent).toContain("Nenhuma venda aprovada neste período.");
});

it.each([
  "Approved",
  "Received",
  "Preparing",
  "ReadyForPickup",
  "OutForDelivery",
  "Completed",
  "Cancelled",
])("badge %s preserves its readable status and a semantic visual state", (status) => {
  document.getElementById("root").innerHTML = views.badge(status);
  const badge = document.querySelector(".badge");
  expect(badge.classList.contains(`badge-${status.toLowerCase()}`)).toBe(true);
  expect(badge.textContent.length).toBeGreaterThan(0);
  expect(badge.textContent).not.toBe(status);
});

it("unknown profit remains unavailable with an accessible explanation", () => {
  document.getElementById("root").innerHTML = views.card(
    "Lucro bruto estimado",
    money(null),
    "coins",
    true,
  );
  expect(document.querySelector("strong").textContent).toBe("Não disponível");
  expect(document.querySelector(".info-trigger").getAttribute("aria-label")).toContain(
    "lucro bruto",
  );
  expect(document.querySelector(".tooltip").textContent).toContain(
    "Não inclui despesas operacionais",
  );
});

it("payment composition renders only API methods and percentages", () => {
  document.getElementById("root").innerHTML = views.paymentMethods([
    { method: "Pix", count: 3, revenue: 125, percentage: 25 },
  ]);
  expect(document.body.textContent).toContain("PIX");
  expect(document.body.textContent).toContain("125,00");
  expect(document.body.textContent).toContain("25% do faturamento");
  expect(document.querySelector(".method-track span").style.width).toBe("25%");
  expect(views.paymentMethods([])).toContain("Sem pagamentos aprovados.");
});
