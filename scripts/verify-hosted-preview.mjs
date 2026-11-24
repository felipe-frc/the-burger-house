import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Read-only deployment rehearsal: never signs in, creates orders, prepares
// payments, follows authentication redirects or changes access protection.
export async function verifyHostedPreview(origin, fetcher = fetch) {
  const target = new URL(origin);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  )
    throw new Error("Informe somente a origem HTTPS do Preview.");
  const report = {
    checkedAt: new Date().toISOString(),
    origin: target.origin,
    status: "running",
    checks: [],
    nonceDistinct: false,
  };
  const nonces = [];
  const paths = [
    "/",
    "/menu",
    "/menu",
    "/api/products",
    "/api/admin/auth/login",
    "/api/admin/auth/me",
    "/admin/",
    "/scripts/utils.js",
    "/scripts/config.js",
    "/styles/privacy.css",
    "/privacy.html",
  ];
  for (const path of paths) {
    if (path === "/styles/privacy.css" && report.entryMode === "static") continue;
    const response = await fetcher(`${target.origin}${path}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const check = { method: "GET", path, status: response.status, passed: false };
    report.checks.push(check);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const redirect = new URL(location, target.origin);
        check.redirectDestination = `${redirect.origin}${redirect.pathname}`;
      }
      report.status = "blocked-redirect";
      return report;
    }
    if (path === "/api/admin/auth/me") {
      check.passed = response.status === 401;
      check.expectedAnonymousStatus = 401;
    } else if (path === "/api/products") {
      const data = contentType.includes("json") ? await response.json() : null;
      check.passed =
        response.status === 200 &&
        Array.isArray(data) &&
        data.every((p) => p && typeof p.code === "string" && typeof p.price === "number");
      check.productCount = Array.isArray(data) ? data.length : null;
    } else if (path === "/api/admin/auth/login") {
      const data = contentType.includes("json") ? await response.json() : null;
      const cookies = response.headers.getSetCookie?.() ?? [];
      check.csrfTokenPresent = typeof data?.csrfToken === "string" && data.csrfToken.length > 0;
      check.csrfCookieProtected = cookies.some(
        (cookie) =>
          /^BurgerHouse\.Csrf=/i.test(cookie) &&
          /;\s*secure(?:;|$)/i.test(cookie) &&
          /;\s*httponly(?:;|$)/i.test(cookie) &&
          /;\s*samesite=strict(?:;|$)/i.test(cookie) &&
          /;\s*path=\/api\/admin(?:;|$)/i.test(cookie),
      );
      check.passed = response.status === 200 && check.csrfTokenPresent && check.csrfCookieProtected;
    } else if (path === "/admin/") {
      const html = await response.text();
      const js = /<script\b[^>]*\bsrc="(\/admin\/assets\/[^"]+\.js)"/.exec(html)?.[1];
      const css = /<link\b[^>]*\bhref="(\/admin\/assets\/[^"]+\.css)"/.exec(html)?.[1];

      check.passed =
        response.status === 200 &&
        contentType.includes("text/html") &&
        !!js &&
        !!css &&
        !/\/scripts\/admin\/main\.js/.test(html);

      if (check.passed) {
        for (const asset of [js, css]) {
          const assetResponse = await fetcher(`${target.origin}${asset}`, {
            method: "GET",
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });

          const type = assetResponse.headers.get("content-type") ?? "";
          const assetCheck = {
            method: "GET",
            path: asset,
            status: assetResponse.status,
            passed: assetResponse.status === 200 &&
              (asset.endsWith(".js") ? /javascript/.test(type) : /text\/css/.test(type)),
          };

          report.checks.push(assetCheck);
        }
      }
    } else if (path === "/" || path === "/menu") {
      const html = await response.text();
      const policy = response.headers.get("content-security-policy") ?? "";
      const scriptPolicy = policy.split(";").find((p) => p.trim().startsWith("script-src")) ?? "";
      const nonce = /'nonce-([^']+)'/.exec(scriptPolicy)?.[1];
      const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
      check.applicationPage = !/<title>\s*Login\s*[–-]\s*Vercel\s*<\/title>/i.test(html);
      check.nonceScriptsValid =
        !!nonce &&
        Buffer.from(nonce, "base64").length >= 16 &&
        scripts.length > 0 &&
        scripts.every(([, attrs]) => attrs.includes(`nonce="${nonce}"`));
      check.scriptPolicyStrict =
        !scriptPolicy.includes("unsafe-inline") && !scriptPolicy.includes("unsafe-eval") && !!nonce;
      check.noStore = /no-store/i.test(response.headers.get("cache-control") ?? "");
      const staticPage = /\bid="root"/.test(html) &&
        scripts.some(([, attrs]) => /(?:^|\s)type="module"/.test(attrs)) &&
        scripts.every(([, attrs]) => /(?:^|\s)src="\/assets\/[\w.-]+\.js"/.test(attrs));
      const mode = staticPage ? "static" : "ssr";
      const consistentMode = !report.entryMode || report.entryMode === mode;
      report.entryMode = mode;
      if (staticPage) check.scriptPolicyStrict = scriptPolicy.trim() === "script-src 'self'";
      check.entryMode = mode;
      check.passed =
        response.status === 200 &&
        contentType.includes("text/html") &&
        check.applicationPage &&
        consistentMode &&
        check.scriptPolicyStrict &&
        (staticPage || (check.nonceScriptsValid && check.noStore));
      if (nonce) nonces.push(nonce);
      if (!check.applicationPage) {
        report.status = "blocked-login-page";
        return report;
      }
    } else {
      const expectedType = path.endsWith(".js")
        ? /javascript/
        : path.endsWith(".css")
          ? /text\/css/
          : /text\/html/;
      check.passed = response.status === 200 && expectedType.test(contentType);
    }
  }
  report.nonceDistinct = nonces.length === 3 && new Set(nonces).size === 3;
  report.status =
    (report.entryMode === "static" || report.nonceDistinct) && report.checks.every((check) => check.passed)
      ? "passed-read-only-checks"
      : "failed-checks";
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const origin = process.env.BURGER_PREVIEW_ORIGIN;
  if (!origin)
    throw new Error("Defina BURGER_PREVIEW_ORIGIN com a origem HTTPS do Preview autorizado.");
  const report = await verifyHostedPreview(origin);
  const path = resolve("test-results/hosted-preview-preflight.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed-read-only-checks") process.exitCode = 1;
}
