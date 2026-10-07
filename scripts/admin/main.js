import { createAdminClient, AdminError } from "./client.js";
import { createOrderNotifier, createPoller, money, statusLabels, methodLabels } from "./model.js";
import * as views from "./views.js";
import { isStoreOpenNow } from "../utils.js";
import { STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from "../config.js";

export function createAdminApp(root, request = createAdminClient()) {
  let disposed = false;
  let authenticated = false,
    route = "",
    version = 0,
    periodQuery = "period=7d",
    page = 1;
  let orderQuery = new URLSearchParams();
  let notificationCursor = null,
    newPaidCount = 0;
  const notifier = createOrderNotifier();
  const message = (text) => {
    if (disposed) return;
    const el = document.getElementById("admin-message");
    if (el) el.textContent = text;
  };
  const content = () => root.querySelector("#content");
  const setContent = (html) => {
    content().innerHTML = html;
  };
  const poller = createPoller(async () => {
    if (!authenticated || document.hidden) return;
    const current = version;
    try {
      await refreshNotifications();
      if (!authenticated || current !== version) return;
      if (route === "/admin/orders") await loadOrders(current);
      if (route === "/admin/dashboard") {
        const data = await request("dashboard");
        if (current !== version) return;
        updateDashboard(data);
        const points = await request(`finance/revenue?${periodQuery}`);
        if (current === version)
          root.querySelector("#revenue-chart").innerHTML = views.chart(points);
      }
    } catch (error) {
      handleError(error);
    }
  });
  async function refreshNotifications() {
    let afterId = 0,
      until = "",
      more;
    const since = notificationCursor;
    do {
      const query = new URLSearchParams();
      if (since) query.set("since", since);
      if (until) query.set("until", until);
      if (afterId) query.set("afterId", String(afterId));
      const batch = await request(`notifications?${query}`);
      if (!authenticated || disposed) return;
      until = batch.until;
      newPaidCount = batch.newPaidOrders;
      const count = root.querySelector("#order-count");
      if (count) count.textContent = String(newPaidCount);
      const added = notifier.detect(batch.items);
      if (added.length)
        message(
          added
            .map(
              (o) =>
                `Novo pedido pago · #${o.id} · ${money(o.total)} · ${methodLabels[o.paymentMethod] || "Pagamento"}`,
            )
            .join("\n"),
        );
      afterId = batch.nextAfterId;
      more = afterId != null;
    } while (more && authenticated);
    notificationCursor = until;
  }
  function updateDashboard(data) {
    const count = root.querySelector("#order-count");
    if (count) count.textContent = String(data.newPaidOrders);
    const cards = root.querySelector("#dashboard-cards");
    if (cards) {
      cards.innerHTML = views.dashboardCards(data);
      root.querySelector("#recent-orders").innerHTML = views.orderTable(data.recentOrders);
      root.querySelector("#coverage").innerHTML = views.coverage(data.month);
    }
  }
  function handleError(error) {
    if (disposed) return;
    if (error instanceof AdminError && error.status === 401 && authenticated) {
      authenticated = false;
      poller.stop();
      notifier.clear();
      notificationCursor = null;
      go("/admin/", true);
      message("Sessão expirada. Entre novamente.");
    } else
      message(
        error instanceof AdminError
          ? error.message
          : "Não foi possível carregar os dados. Tente novamente.",
      );
  }
  function shell() {
    root.innerHTML = views.shell(route);
  }
  async function loginView() {
    root.innerHTML = views.login();
    await request("auth/login");
  }
  async function go(path, replace = false) {
    if (disposed) return;
    const target = /^\/admin\/(dashboard|orders(?:\/\d+)?|finance|products|store)$/.test(path)
      ? path
      : "/admin/";
    route = authenticated ? (target === "/admin/" ? "/admin/dashboard" : target) : "/admin/";
    history[replace ? "replaceState" : "pushState"]({}, "", route);
    const current = ++version;
    page = 1;
    periodQuery = "period=7d";
    orderQuery = new URLSearchParams();
    try {
      if (!authenticated) {
        await loginView();
        return;
      }
      shell();
      root.querySelector("#order-count").textContent = String(newPaidCount);
      if (route === "/admin/dashboard") {
        const data = await request("dashboard");
        if (current !== version) return;
        setContent(views.dashboard(data));
        updateDashboard(data);
        const points = await request(`finance/revenue?${periodQuery}`);
        if (current === version)
          root.querySelector("#revenue-chart").innerHTML = views.chart(points);
      } else if (route === "/admin/orders") {
        setContent(
          views.title("Pedidos", "Acompanhe cada pedido do recebimento à conclusão.") +
            `<form id="order-filters" class="filters"><label>Buscar pedido ou cliente<input name="search" maxlength="120" type="search"></label><label>Status<select name="status"><option value="">Todos</option>${["Received", "Preparing", "ReadyForPickup", "OutForDelivery", "Completed", "Cancelled", "PendingPayment"].map((s) => `<option value="${s}">${statusLabels[s]}</option>`).join("")}</select></label><label>Ordenação<select name="sort"><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></label><button>Filtrar</button></form><div class="panel" id="order-list"></div>`,
        );
        await loadOrders(current);
      } else if (/^\/admin\/orders\/\d+$/.test(route)) {
        const data = await request(`orders/${route.split("/").at(-1)}`);
        if (current === version) setContent(views.orderDetails(data));
      } else if (route === "/admin/finance") {
        const data = await request("dashboard");
        if (current !== version) return;
        setContent(views.finance(data));
        await loadFinance(current);
      } else if (route === "/admin/products") {
        const data = await request("products");
        if (current === version) setContent(views.products(data));
      } else {
        const data = await request("store");
        if (current === version)
          setContent(
            views.store(data, isStoreOpenNow(), `${STORE_OPEN_HOUR}h às ${STORE_CLOSE_HOUR}h`),
          );
      }
      if (!disposed) poller.start();
    } catch (error) {
      handleError(error);
    }
  }
  async function loadOrders(current = version) {
    const result = await request(`orders?${orderQuery}&page=${page}`);
    if (current === version)
      root.querySelector("#order-list").innerHTML =
        views.orderTable(result.items) + views.pagination(result);
  }
  async function loadFinance(current = version) {
    const [summary, points, methods, transactions] = await Promise.all([
      request(`finance/summary?${periodQuery}`),
      request(`finance/revenue?${periodQuery}`),
      request(`finance/payment-methods?${periodQuery}`),
      request(`finance/transactions?${periodQuery}&page=${page}`),
    ]);
    if (current !== version) return;
    root.querySelector("#finance-results").innerHTML = views.financeResults(
      summary,
      points,
      methods,
      transactions,
    );
  }
  async function click(event) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[data-nav]");
    if (link) {
      event.preventDefault();
      await go(link.getAttribute("href"));
      return;
    }
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    try {
      if (button.id === "menu-toggle") {
        const open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        root.querySelector("#admin-nav").classList.toggle("open", open);
      } else if (button.id === "logout") {
        button.disabled = true;
        await request("auth/logout", { method: "POST" });
        authenticated = false;
        poller.stop();
        notifier.clear();
        notificationCursor = null;
        message("");
        await go("/admin/", true);
      } else if (button.id === "advance-status") {
        button.disabled = true;
        await request(`orders/${button.dataset.id}/status`, {
          method: "PATCH",
          body: { expectedStatus: button.dataset.current, status: button.dataset.next },
        });
        await go(route, true);
        message("Status atualizado.");
      } else if (button.dataset.page) {
        page = Number(button.dataset.page);
        if (route === "/admin/orders") await loadOrders();
        else await loadFinance();
      }
    } catch (error) {
      handleError(error);
    } finally {
      button.disabled = false;
    }
  }
  async function submit(event) {
    if (!(event.target instanceof HTMLFormElement)) return;
    event.preventDefault();
    const form = event.target,
      fields = new FormData(form),
      button = form.querySelector("button");
    button.disabled = true;
    try {
      if (form.id === "login-form") {
        await request("auth/login", {
          method: "POST",
          body: { email: fields.get("email"), password: fields.get("password") },
        });
        await request("auth/me");
        if (disposed) return;
        authenticated = true;
        notifier.clear();
        notificationCursor = null;
        await refreshNotifications();
        message("");
        await go("/admin/dashboard", true);
      } else if (form.id === "order-filters") {
        orderQuery = new URLSearchParams({
          search: String(fields.get("search")),
          status: String(fields.get("status")),
          sort: String(fields.get("sort")),
        });
        page = 1;
        await loadOrders();
      } else if (form.id === "period-form") {
        const params = new URLSearchParams({ period: String(fields.get("period")) });
        if (fields.get("period") === "custom") {
          if (!fields.get("start") || !fields.get("end"))
            throw new AdminError("Informe início e fim do período.", 400);
          params.set("start", String(fields.get("start")));
          params.set("end", String(fields.get("end")));
        }
        periodQuery = params.toString();
        page = 1;
        if (route === "/admin/finance") await loadFinance();
        else
          root.querySelector("#revenue-chart").innerHTML = views.chart(
            await request(`finance/revenue?${periodQuery}`),
          );
      } else if (form.dataset.product) {
        await request(`products/${form.dataset.product}`, {
          method: "PATCH",
          body: {
            price: Number(fields.get("price")),
            costPrice: fields.get("costPrice") === "" ? null : Number(fields.get("costPrice")),
            isActive: fields.has("isActive"),
          },
        });
        await go(route, true);
        message(
          "Produto atualizado. Revise o cardápio estático se alterou preço ou disponibilidade.",
        );
      }
    } catch (error) {
      if (form.id === "login-form") {
        form.querySelector("#login-error").textContent =
          error instanceof AdminError && error.status === 401
            ? "Credenciais inválidas."
            : error instanceof AdminError
              ? error.message
              : "Não foi possível entrar. Tente novamente.";
      } else handleError(error);
    } finally {
      button.disabled = false;
    }
  }
  const pop = () => go(location.pathname, true);
  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  globalThis.addEventListener("popstate", pop);
  return {
    async start() {
      try {
        await request("auth/me");
        if (disposed) return;
        authenticated = true;
        await refreshNotifications();
      } catch (error) {
        if (!(error instanceof AdminError && error.status === 401)) {
          handleError(error);
          return;
        }
      }
      await go(location.pathname, true);
    },
    stop() {
      disposed = true;
      authenticated = false;
      ++version;
      poller.stop();
      root.removeEventListener("click", click);
      root.removeEventListener("submit", submit);
      globalThis.removeEventListener("popstate", pop);
    },
    go,
  };
}
export function mountAdmin(root, request = createAdminClient()) {
  let app;
  const start = () => {
    app = createAdminApp(root, request);
    app.start();
  };
  const hide = () => {
    app.stop();
    root.replaceChildren();
  };
  const show = (event) => {
    if (event.persisted) start();
  };
  globalThis.addEventListener("pagehide", hide);
  globalThis.addEventListener("pageshow", show);
  start();
  return () => {
    app.stop();
    globalThis.removeEventListener("pagehide", hide);
    globalThis.removeEventListener("pageshow", show);
  };
}
const root = document.getElementById("admin-app");
if (root) mountAdmin(root);
