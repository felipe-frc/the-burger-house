// @vitest-environment node
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import products from "../../scripts/admin/missing-products.json";

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});
function run(origin: string, args: string[] = []) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/admin/register-missing-products.mjs", ...args],
      {
        env: {
          ...process.env,
          BURGER_API_ORIGIN: origin,
          BURGER_ADMIN_EMAIL: "local@example.com",
          BURGER_ADMIN_PASSWORD: "local-fixture-only",
        },
        windowsHide: true,
      },
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}
describe("missing-product registration", () => {
  it("blocks every external write without the explicit production flag before connecting", async () => {
    const result = await run("https://store.example.com", ["--apply"]);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Produção bloqueada");
  });
  it("validates the ten real planned payloads, CSRF sequence, dry-run and repeat safety", async () => {
    const records: ((typeof products)[number] & { id: number; code: string })[] = [];
    const calls: string[] = [];
    const failures: string[] = [];
    server = createServer(async (req, res) => {
      const path = req.url!;
      calls.push(`${req.method} ${path}`);
      res.setHeader("Content-Type", "application/json");
      if (path === "/api/products") return res.end(JSON.stringify(records));
      if (path === "/api/admin/auth/login" && req.method === "GET") {
        res.setHeader("Set-Cookie", "BurgerHouse.Csrf=local; Path=/api/admin; HttpOnly");
        return res.end(JSON.stringify({ csrfToken: "anonymous-csrf" }));
      }
      if (req.method === "POST") {
        if (!req.headers.cookie?.includes("BurgerHouse.Csrf=local"))
          failures.push("missing CSRF cookie");
        const csrf = path.endsWith("/login") ? "anonymous-csrf" : "owner-csrf";
        if (req.headers["x-csrf-token"] !== csrf) failures.push("invalid CSRF token");
      }
      if (path.endsWith("/login")) {
        res.setHeader("Set-Cookie", "BurgerHouse.Owner=local-owner; Path=/api/admin; HttpOnly");
        return res.end(JSON.stringify({ role: "Owner" }));
      }
      if (!req.headers.cookie?.includes("BurgerHouse.Owner=local-owner"))
        failures.push("missing owner cookie");
      if (path.endsWith("/me"))
        return res.end(JSON.stringify({ role: "Owner", csrfToken: "owner-csrf" }));
      if (req.method === "GET") return res.end(JSON.stringify(records));
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      records.push({
        ...payload,
        id: records.length + 1,
        code: `local-product-${records.length + 1}`,
      });
      res.statusCode = 201;
      return res.end(JSON.stringify({ id: records.length }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    const dryRun = await run(origin);
    expect(dryRun.code).toBe(0);
    expect(records).toHaveLength(0);
    expect(calls).toEqual(["GET /api/products"]);
    expect((await run(origin, ["--apply"])).code).toBe(0);
    expect(records.map(({ id: _id, code: _code, ...record }) => record)).toEqual(products);
    expect(records).toHaveLength(10);
    expect(
      records.every(
        (p) =>
          p.description.length <= 500 &&
          p.name.length <= 150 &&
          p.price > 0 &&
          ["menu", "sides", "drinks"].includes(p.category),
      ),
    ).toBe(true);
    expect(failures).toEqual([]);
    expect((await run(origin, ["--apply"])).code).toBe(0);
    expect(records).toHaveLength(10);
  });
  it("stops at the first real login 401 and reports no product writes or secrets", async () => {
    const calls: string[] = [];
    server = createServer((req, res) => {
      calls.push(`${req.method} ${req.url}`);
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/products") return res.end("[]");
      if (req.method === "GET") {
        res.setHeader("Set-Cookie", "BurgerHouse.Csrf=local; Path=/api/admin");
        return res.end(JSON.stringify({ csrfToken: "test-secret-csrf" }));
      }
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Credenciais inválidas." }));
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const path = resolve(`.test-tmp/registration-401-${Date.now()}.json`);
    try {
      const result = await run(origin, ["--apply", `--report=${path}`]);
      expect(result.code).toBe(1);
      expect(result.output).toContain("HTTP 401");
      expect(calls).toEqual([
        "GET /api/products",
        "GET /api/admin/auth/login",
        "POST /api/admin/auth/login",
      ]);
      const raw = await readFile(path, "utf8");
      const report = JSON.parse(raw);
      expect(report).toMatchObject({
        status: "blocked-unauthorized",
        authenticated: false,
        created: [],
      });
      expect(raw).not.toContain("local-fixture-only");
      expect(raw).not.toContain("local@example.com");
      expect(raw).not.toContain("test-secret-csrf");
    } finally {
      await rm(path, { force: true });
    }
  });
});
