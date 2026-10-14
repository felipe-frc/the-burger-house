import { createAdminClient, AdminError } from "./client.js";
import { createOrderNotifier, createPoller, statusLabels } from "./model.js";
import * as views from "./views.js";
import { isStoreOpenNow } from "../utils.js";
import { STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from "../config.js";

function productClassification(fields) {
  const category = String(fields.get("category"));
  const rawPosition = String(fields.get("displayOrder") ?? "").trim();
  const displayOrder = Number(rawPosition);
  if (!["menu", "sides", "drinks"].includes(category) || !rawPosition ||
      !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999999) {
    throw new AdminError("Selecione uma categoria e uma ordem inteira entre 0 e 999999.", 400);
  }
  return { category, displayOrder };
}

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
  let notifications = [],
    notificationFilter = "all",
    toastQueue = [],
    toastTimer;
  function renderNotifications() {
    const count = root.querySelector("#notification-count");
    if (count) count.textContent = String(notifications.filter((item) => !item.read).length);
    const list = root.querySelector("#notification-list");
    if (list)
      list.innerHTML = views.notificationHistory(
        notifications.filter(
          (item) => notificationFilter === "all" || item.category === notificationFilter,
        ),
      );
    root
      .querySelectorAll("[data-notification-filter]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.notificationFilter === notificationFilter),
        ),
      );
  }
  const mobileDrawer = () => globalThis.matchMedia?.("(max-width: 640px)").matches;
  function setDrawer(open, focus = true) {
    const panel = root.querySelector("#notifications-panel");
    if (!panel) return;
    panel.hidden = !open;
    panel.setAttribute("role", mobileDrawer() ? "dialog" : "region");
    if (open && mobileDrawer()) panel.setAttribute("aria-modal", "true");
    else panel.removeAttribute("aria-modal");
    root.querySelector("#notifications-toggle").setAttribute("aria-expanded", String(open));
    root.querySelector("#notifications-overlay").hidden = !open;
    root.querySelectorAll(".topbar, .layout").forEach((element) => {
      element.inert = Boolean(open && mobileDrawer());
    });
    root.classList.toggle("notifications-open", open);
    if (focus) root.querySelector(open ? "#notifications-close" : "#notifications-toggle").focus();
  }
  function dismissToast() {
    clearTimeout(toastTimer);
    document.getElementById("admin-message")?.replaceChildren();
    if (toastQueue.length && !disposed) showNextToast();
  }
  function showNextToast() {
    const el = document.getElementById("admin-message");
    if (!el || !toastQueue.length || disposed) return;
    const text = document.createElement("div");
    toastQueue
      .shift()
      .split("\n")
      .forEach((line, index) => {
        const part = document.createElement(index === 1 ? "strong" : "p");
        part.textContent = line;
        text.append(part);
      });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Fechar notificação");
    close.onclick = dismissToast;
    el.replaceChildren(text, close);
    toastTimer = setTimeout(dismissToast, 7000);
  }
  const message = (text) => {
    if (disposed) return;
    if (!text) {
      toastQueue = [];
      dismissToast();
      return;
    }
    toastQueue.push(text);
    toastQueue = toastQueue.slice(-50);
    if (!document.getElementById("admin-message")?.hasChildNodes()) showNextToast();
  };
  function resetNotifications() {
    setDrawer(false, false);
    root.classList.remove("notifications-open");
    notifications = [];
    notificationFilter = "all";
    notifier.clear();
    message("");
    renderNotifications();
  }
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
    const observed = new Map();
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
      batch.items.forEach((order) => observed.set(order.id, order));
      afterId = batch.nextAfterId;
      more = afterId != null;
    } while (more && authenticated);
    // The notification endpoint covers approvals only. Read existing order pages
    // for pending and operational transitions, independently of visible filters.
    let currentPage = 1;
    let result;
    do {
      result = await request(`orders?sort=newest&page=${currentPage}`);
      if (!authenticated || disposed) return;
      result.items.forEach((order) => observed.set(order.id, order));
      currentPage++;
    } while (result.items.length && (currentPage - 1) * result.pageSize < result.total);
    for (const event of notifier.detect([...observed.values()])) {
      notifications.unshift({ ...event, read: false });
      notifications = notifications.slice(0, 50);
      message(`Pedido #${event.orderId}\n${event.title}\n${event.message}`);
    }
    renderNotifications();
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
      resetNotifications();
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
    root.classList.remove("notifications-open");
    root.innerHTML = views.shell(route);
    renderNotifications();
  }
  async function loginView() {
    root.innerHTML = views.login();
    await request("auth/login");
  }
  async function go(path, replace = false) {
    if (disposed) return;
    const target = /^\/admin\/(dashboard|orders(?:\/\d+)?|finance|products|store|security)$/.test(
      path,
    )
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
      } else if (route === "/admin/store") {
        const data = await request("store");
        if (current === version)
          setContent(
            views.store(data, isStoreOpenNow(), `${STORE_OPEN_HOUR}h às ${STORE_CLOSE_HOUR}h`),
          );
      } else if (route === "/admin/security") {
        setContent(views.security());
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
    const [summary, points, methods, transactions, auditLogs] = await Promise.all([
      request(`finance/summary?${periodQuery}`),
      request(`finance/revenue?${periodQuery}`),
      request(`finance/payment-methods?${periodQuery}`),
      request(`finance/transactions?${periodQuery}&page=${page}`),
      request(`finance/audit?${periodQuery}`),
    ]);
    if (current !== version) return;
    root.querySelector("#finance-results").innerHTML = views.financeResults(
      summary,
      points,
      methods,
      transactions,
      auditLogs,
    );
  }
  function productTranslationInput(event) {
    const field = event.target;

    if (!(field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement)) return;

    if (field.name !== "name" && field.name !== "description") return;

    const form = field.closest("form");

    if (!form || !(form.id === "create-product-form" || form.dataset.product)) {
      return;
    }

    const englishName = form.elements.namedItem("englishName");
    const englishDescription = form.elements.namedItem("englishDescription");

    if (!(englishName instanceof HTMLInputElement) || !(englishDescription instanceof HTMLTextAreaElement)) return;

    // Uma mudanca no texto original invalida a traducao existente.
    if (englishName.value.trim() || englishDescription.value.trim()) {
      englishName.value = "";
      englishDescription.value = "";

      const status = form.querySelector("[data-translation-status]");

      if (status) {
        status.textContent =
          "Tradução desatualizada. Clique para traduzir novamente. " +
          "Se salvar sem traduzir, o Azure processará a tradução pendente.";
      }

      form.dataset.translationOutdated = "true";
    }
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
      if (button.hasAttribute("data-toggle-product")) {
        event.preventDefault();

        const form = button.closest("form");
        if (!form) return;

        const checkbox = form.elements.namedItem("isActive");

        if (!(checkbox instanceof HTMLInputElement)) return;

        if (!form.reportValidity()) return;
        const currentlyActive = checkbox.checked;

        const question = currentlyActive
          ? "Desativar este produto? Ele deixará de estar disponível para novos pedidos. O histórico será preservado. Outras alterações feitas neste formulário também serão salvas."
          : "Reativar este produto? Ele voltará a estar disponível para novos pedidos. Outras alterações feitas neste formulário também serão salvas.";

        if (!globalThis.confirm(question)) return;

        button.disabled = true;

        try {
          const fields = new FormData(form);

          const englishName = String(fields.get("englishName") ?? "").trim();
          const englishDescription = String(fields.get("englishDescription") ?? "").trim();

          if (Boolean(englishName) !== Boolean(englishDescription)) {
            message("Preencha os dois campos em inglês ou deixe ambos vazios.");
            return;
          }

          await request(`products/${form.dataset.product}`, {
            method: "PATCH",
            body: {
              name: String(fields.get("name") ?? "").trim(),
              description: String(fields.get("description") ?? "").trim(),
              englishName,
              englishDescription,
              ...productClassification(fields),
              price: Number(fields.get("price")),
              costPrice: fields.get("costPrice") === ""
                ? null
                : Number(fields.get("costPrice")),
              isActive: !currentlyActive,
            },
          });

          await go(route, true);

          message(
            currentlyActive
              ? "Produto desativado. O histórico de pedidos foi preservado."
              : "Produto reativado com sucesso.",
          );
        } catch (error) {
          handleError(error);
        } finally {
          button.disabled = false;
        }

      } else if (button.hasAttribute("data-translate-product")) {
        event.preventDefault();

        const form = button.closest("form");

        if (!form) return;

        const nameInput = form.elements.namedItem("name");
        const descriptionInput = form.elements.namedItem("description");
        const englishNameInput = form.elements.namedItem("englishName");
        const englishDescriptionInput = form.elements.namedItem("englishDescription");
        const status = form.querySelector("[data-translation-status]");

        const name = String(nameInput?.value ?? "").trim();
        const description = String(descriptionInput?.value ?? "").trim();

        if (!name || !description) {
          if (status) status.textContent = "Preencha primeiro o nome e a descrição em português.";
          return;
        }

        button.disabled = true;
        const originalLabel = button.innerHTML;
        button.textContent = "Traduzindo...";
        if (status) status.textContent = "Consultando o Azure Translator...";

        try {
          const result = await request("products/translate", {
            method: "POST",
            body: { name, description },
          });

          if (String(nameInput.value).trim() !== name ||
              String(descriptionInput.value).trim() !== description) {
            if (status) status.textContent = "O português mudou durante a tradução. Traduza novamente.";
            return;
          }

          if (!result?.englishName || !result?.englishDescription) {
            throw new Error("Resposta de tradução incompleta.");
          }

          englishNameInput.value = result.englishName;
          englishDescriptionInput.value = result.englishDescription;
          delete form.dataset.translationOutdated;

          if (status) status.textContent = "Tradução concluída. Revise o inglês antes de salvar.";
        } catch (error) {
          if (status) {
            status.textContent = "Não foi possível traduzir agora. Tente novamente.";
          }
          handleError(error);
        } finally {
          button.innerHTML = originalLabel;
          button.disabled = false;
        }

      } else if (button.id === "menu-toggle") {
        const open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        root.querySelector("#admin-nav").classList.toggle("open", open);
      } else if (
        ["notifications-toggle", "notifications-close", "notifications-overlay"].includes(button.id)
      ) {
        const toggle = root.querySelector("#notifications-toggle");
        const open =
          button.id === "notifications-toggle" && toggle.getAttribute("aria-expanded") !== "true";
        setDrawer(open);
      } else if (button.dataset.notificationFilter) {
        notificationFilter = button.dataset.notificationFilter;
        renderNotifications();
      } else if (button.id === "notifications-read") {
        notifications.forEach((item) => {
          item.read = true;
        });
        renderNotifications();
      } else if (button.id === "notifications-clear") {
        notifications = [];
        renderNotifications();
      } else if (button.id === "logout") {
        button.disabled = true;
        await request("auth/logout", { method: "POST" });
        authenticated = false;
        poller.stop();
        resetNotifications();
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
      button = form.querySelector('button[type="submit"]') ?? form.querySelector("button");
    if (form.id === "create-product-form" || form.dataset.product) {
      const englishName = String(fields.get("englishName") ?? "").trim();
      const englishDescription = String(fields.get("englishDescription") ?? "").trim();

      if (Boolean(englishName) !== Boolean(englishDescription)) {
        message("Preencha o nome e a descrição em inglês juntos, ou deixe ambos vazios.");
        return;
      }
    }

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
        resetNotifications();
        notificationCursor = null;
        await refreshNotifications();
        message("");
        await go("/admin/dashboard", true);
      } else if (form.id === "change-password-form") {
        const currentPassword = String(fields.get("currentPassword"));
        const newPassword = String(fields.get("newPassword"));
        const confirmPassword = String(fields.get("confirmPassword"));

        if (newPassword !== confirmPassword)
          throw new AdminError("As novas senhas não coincidem.", 400);

        await request("auth/change-password", {
          method: "POST",
          body: { currentPassword, newPassword },
        });

        authenticated = false;
        poller.stop();
        resetNotifications();
        notificationCursor = null;
        await go("/admin/", true);
        message("Senha alterada. Entre novamente.");
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
      } else if (form.id === "create-product-form") {
        await request("products", {
          method: "POST",
          body: {
            name: String(fields.get("name") ?? "").trim(),
            description: String(fields.get("description") ?? "").trim(),
            englishName: String(fields.get("englishName") ?? "").trim(),
            englishDescription: String(fields.get("englishDescription") ?? "").trim(),
            ...productClassification(fields),
            price: Number(fields.get("price")),
            costPrice: fields.get("costPrice") === "" ? null : Number(fields.get("costPrice")),
            isActive: fields.has("isActive"),
          },
        });

        await go(route, true);
        message("Produto cadastrado com sucesso.");
      } else if (form.dataset.product) {
        await request(`products/${form.dataset.product}`, {
          method: "PATCH",
          body: {
            name: String(fields.get("name") ?? "").trim(),
            description: String(fields.get("description") ?? "").trim(),
            englishName: String(fields.get("englishName") ?? "").trim(),
            englishDescription: String(fields.get("englishDescription") ?? "").trim(),
            ...productClassification(fields),
            price: Number(fields.get("price")),
            costPrice: fields.get("costPrice") === "" ? null : Number(fields.get("costPrice")),
            isActive: fields.has("isActive"),
          },
        });
        await go(route, true);
        message(
          "Produto atualizado. As alterações serão refletidas no cardápio público na próxima atualização dos dados.",
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
      } else if (form.id === "change-password-form") {
        form.querySelector("#password-error").textContent =
          error instanceof AdminError && error.status === 401
            ? "Senha atual inválida."
            : error instanceof AdminError
              ? error.message
              : "Não foi possível alterar a senha. Tente novamente.";
      } else handleError(error);
    } finally {
      button.disabled = false;
    }
  }
  const pop = () => go(location.pathname, true);
  const keydown = (event) => {
    const panel = root.querySelector("#notifications-panel");
    if (panel && !panel.hidden && mobileDrawer() && event.key === "Tab") {
      const buttons = [...panel.querySelectorAll("button")];
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if (
      event.key === "Escape" &&
      root.querySelector("#notifications-toggle")?.getAttribute("aria-expanded") === "true"
    )
      root.querySelector("#notifications-close")?.click();
  };
  const resize = () => {
    const panel = root.querySelector("#notifications-panel");
    if (panel && !panel.hidden) setDrawer(true, false);
  };
  root.addEventListener("input", productTranslationInput);
  root.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  root.addEventListener("submit", submit);
  globalThis.addEventListener("popstate", pop);
  globalThis.addEventListener("resize", resize);
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
      setDrawer(false, false);
      message("");
      disposed = true;
      authenticated = false;
      ++version;
      poller.stop();
      root.removeEventListener("click", click);
      root.removeEventListener("keydown", keydown);
      root.removeEventListener("submit", submit);
      globalThis.removeEventListener("popstate", pop);
      globalThis.removeEventListener("resize", resize);
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
