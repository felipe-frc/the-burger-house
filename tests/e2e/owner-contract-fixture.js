import { expect } from './owner-react-fixture.js';
import { mockData, order } from '../admin-fixtures.js';

// Browser tests with isolated API fixtures. The real API is never called.
export async function fixture(page) {
  let signedIn = false;
  let password = "synthetic-test-password";
  let status = order.status;
  const currentOrder = { ...order, createdAt: new Date().toISOString() };
  let settings = mockData("operation/settings");
  let products = mockData("products");
  const mutations = [];
  const calls = [];
  await page.route("**/api/admin/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice("/api/admin/".length);
    const method = request.method();
    const token = request.headers()["x-csrf-token"];
    calls.push({ path, method, query: url.searchParams });
    if (path === "auth/login") {
      if (method === "GET") return route.fulfill({ json: { csrfToken: "anonymous-fixture" } });
      expect(token).toBe("anonymous-fixture");
      signedIn = request.postDataJSON().password === password;
      return signedIn ? route.fulfill({ json: { role: "Owner" } })
        : route.fulfill({ status: 401, json: { error: "Credenciais inválidas." } });
    }
    if (!signedIn) return route.fulfill({ status: 401, json: { error: "Sessão necessária." } });
    if (path === "auth/me") return route.fulfill({ json: { role: "Owner", csrfToken: "owner-fixture" } });
    if (path === "notifications/inbox") return route.fulfill({ json: { items: [], beforeId: null, unreadCount: 0 } });
    if (path === "stock" || path === "agenda") return route.fulfill({ json: [] });
    if (path === "auth/logout") {
      expect(token).toBe("owner-fixture");
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "auth/change-password" && method === "POST") {
      expect(token).toBe("owner-fixture");
      const input = request.postDataJSON();
      if (input.currentPassword !== password) return route.fulfill({ status: 401, json: { error: "Senha atual inválida." } });
      password = input.newPassword;
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "products/1" && method === "PATCH") {
      expect(token).toBe("owner-fixture");
      products = [{ ...products[0], ...request.postDataJSON() }];
      return route.fulfill({ status: 204 });
    }
    if (path === "products") return route.fulfill({ json: products });
    if (path === "operation/settings" && method === "PUT") {
      expect(token).toBe("owner-fixture");
      const data = request.postDataJSON();
      if (data.revision !== settings.revision) return route.fulfill({ status: 409 });
      settings = { limits: data.limits, revision: data.revision + 1 };
      return route.fulfill({ status: 204 });
    }
    if (path === "operation/settings") return route.fulfill({ json: settings });
    if (path === "orders/108/status") {
      expect(token).toBe("owner-fixture");
      const body = request.postDataJSON();
      mutations.push(body);
      expect(body.expectedStatus).toBe(status);
      status = body.status;
      return route.fulfill({ status: 204 });
    }
    if (path === "orders" || path === "orders/operational") {
      const filter = url.searchParams.get("Status");
      const items = !filter || filter === status ? [{ ...currentOrder, status }] : [];
      return route.fulfill({ json: { items: path === "orders" ? items : items.map(order => ({ ...mockData("orders/108"), order })), total: items.length, pageSize: 20, pageNumber: 1 } });
    }
    if (path === "orders/108") {
      const detail = mockData(path);
      detail.order.createdAt = currentOrder.createdAt;
      detail.order.status = status;
      return route.fulfill({ json: detail });
    }
    const data = mockData(path === "customers" ? "customers?" : path + url.search);
    if (data === null) return route.fulfill({ status: 404, json: { error: "Rota ausente da fixture." } });
    return route.fulfill({ json: data });
  });
  return { mutations, calls };
}


export async function signIn(page, password = "synthetic-test-password") {
  await page.getByLabel("E-mail", { exact: true }).fill("owner@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Entrar/ }).click();
}
