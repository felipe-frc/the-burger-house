import { test, expect } from "./owner-react-fixture.js";
import { createServer } from "node:http";
import { once } from "node:events";

test.describe("Owner React - pacote oficial", () => {

  test("bloqueia tráfego fora da origem isolada", async ({ page }) => {
    let requests = 0;
    const otherOrigin = createServer((request, response) => {
      requests++;
      response.writeHead(200, { "Access-Control-Allow-Origin": "*" }).end("unexpected");
    });
    otherOrigin.listen(0, "127.0.0.1");
    await once(otherOrigin, "listening");
    try {
      // Avoid the application's CSP so this assertion exercises the fixture boundary.
      await page.goto("about:blank");
      const reached = await page.evaluate(async url => {
        try { await fetch(url); return true; } catch { return false; }
      }, `http://127.0.0.1:${otherOrigin.address().port}/network-probe`);
      expect(reached).toBe(false);
      expect(requests).toBe(0);
    } finally {
      await new Promise(resolve => otherOrigin.close(resolve));
    }
  });

  test("renderiza a aplicacao administrativa", async ({ page }) => {
    const errors = [];

    page.on("pageerror", error => {
      errors.push(error.message);
    });

    const response = await page.goto("/admin/");

    expect(response?.status()).toBe(200);

    await expect(page.locator("#root")).toBeAttached();

    await expect.poll(async () => {
      return page.locator("#root").evaluate(
        element => element.children.length
      );
    }).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test("nao carrega o administrativo JavaScript antigo", async ({ page }) => {
    await page.goto("/admin/");

    const legacyScripts = await page.locator(
      'script[src*="/scripts/admin/"]'
    ).count();

    expect(legacyScripts).toBe(0);

    const html = await page.content();

    expect(html).not.toContain("/scripts/admin/main.js");
  });

  test("carrega assets do Owner sem falhas HTTP", async ({ page }) => {
    const failures = [];
    const loadedAssets = [];

    page.on("response", response => {
      const url = new URL(response.url());

      if (url.pathname.startsWith("/admin/assets/")) {
        loadedAssets.push(url.pathname);

        const mime = response.headers()["content-type"] || "";
        const expected = url.pathname.endsWith(".js") ? /javascript/ : /text\/css/;
        if (response.status() !== 200 || !expected.test(mime)) {
          failures.push({
            path: url.pathname,
            status: response.status()
          });
        }
      }
    });

    await page.goto("/admin/", {
      waitUntil: "load"
    });

    expect(loadedAssets.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

});
