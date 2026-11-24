import { describe, expect, it, vi } from "vitest";
import { verifyHostedPreview } from "../scripts/verify-hosted-preview.mjs";

function ownerEntry() {
  return new Response('<script type="module" src="/admin/assets/main.js"></script><link rel="stylesheet" href="/admin/assets/main.css">', {
    headers: { "content-type": "text/html" },
  });
}

describe("read-only hosted validation", () => {
  it("stops at deployment protection without following redirects or leaking URL secrets", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://vercel.com/login?secret=private-value" },
        }),
      );
    const report = await verifyHostedPreview("https://preview.example", fetcher);
    expect(report.status).toBe("blocked-redirect");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "manual" });
    expect(JSON.stringify(report)).not.toContain("private-value");
  });
  it("rejects HTTP 200 from a Vercel login page as application evidence", async () => {
    const report = await verifyHostedPreview(
      "https://preview.example",
      async () =>
        new Response("<title>Login – Vercel</title>", { headers: { "content-type": "text/html" } }),
    );
    expect(report.status).toBe("blocked-login-page");
  });
  it("checks SSR, proxy, CSRF and assets using GET only, with no secret values in the report", async () => {
    let page = 0;
    const fetcher = vi.fn(async (url, init) => {
      expect(init.method).toBe("GET");
      const path = new URL(url).pathname;
      if (path === "/admin/") return ownerEntry();
      if (path === "/api/admin/auth/me") return new Response(null, { status: 401 });
      if (path === "/api/products") return Response.json([{ code: "burger-praiano", price: 43.9 }]);
      if (path === "/api/admin/auth/login")
        return Response.json(
          { csrfToken: "private-token" },
          {
            headers: {
              "set-cookie":
                "BurgerHouse.Csrf=private-cookie; Path=/api/admin; Secure; HttpOnly; SameSite=Strict",
            },
          },
        );
      if (path === "/" || path === "/menu") {
        const nonce = Buffer.alloc(16, ++page).toString("base64");
        return new Response(`<script nonce="${nonce}" src="/assets/app.js"></script>`, {
          headers: {
            "content-type": "text/html",
            "content-security-policy": `script-src 'self' 'nonce-${nonce}'`,
            "cache-control": "private, no-store",
          },
        });
      }
      return new Response("fixture", {
        headers: {
          "content-type": path.endsWith(".css")
            ? "text/css"
            : path.endsWith(".js")
              ? "text/javascript"
              : "text/html",
        },
      });
    });
    const report = await verifyHostedPreview("https://preview.example", fetcher);
    expect(report.status).toBe("passed-read-only-checks");
    expect(JSON.stringify(report)).not.toContain("private-token");
    expect(JSON.stringify(report)).not.toContain("private-cookie");
    expect(report.checks).toHaveLength(13);
  });
  it("accepts the Vite entry and rejects an unexpected inline script", async () => {
    for (const inline of [false, true]) {
      const fetcher = vi.fn(async url => {
        const path = new URL(url).pathname;
        if (path === "/admin/") return ownerEntry();
        if (path === "/api/admin/auth/me") return new Response(null, { status: 401 });
        if (path === "/api/products") return Response.json([{ code: "burger-praiano", price: 43.9 }]);
        if (path === "/api/admin/auth/login") return Response.json({ csrfToken: "fixture" }, {
          headers: { "set-cookie": "BurgerHouse.Csrf=fixture; Path=/api/admin; Secure; HttpOnly; SameSite=Strict" },
        });
        if (path === "/" || path === "/menu") {
          return new Response(`<div id="root"></div><script type="module" src="/assets/index-fixture.js"></script>${inline ? '<script>inline()</script>' : ''}`, {
            headers: { "content-type": "text/html", "content-security-policy": "script-src 'self'" },
          });
        }
        return new Response(null, { headers: { "content-type": path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "text/html" } });
      });
      const report = await verifyHostedPreview("https://preview.example", fetcher);
      expect(report.status).toBe(inline ? "failed-checks" : "passed-read-only-checks");
      if (!inline) {
        expect(report.entryMode).toBe("static");
        expect(report.checks.some(check => check.path === "/styles/privacy.css")).toBe(false);
      }
    }
  });
});
