// Local rehearsal of the generated Vercel output. Never forwards requests to production.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { resolveStaticFile } from "./homologation-static.mjs";

const project = resolve(import.meta.dirname, "..");
const root = resolve(project, process.env.BURGER_BUILD_OUTPUT_DIR || ".vercel/output", "static");
const config = JSON.parse(await readFile(resolve(root, "../config.json"), "utf8"));
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};
export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:4173");
    for (const rule of config.routes ?? []) {
      if (rule.headers && new RegExp(`^${rule.src}$`).test(url.pathname)) {
        for (const [key, value] of Object.entries(rule.headers)) res.setHeader(key, value);
      }
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Local browser tests require an explicit API fixture." }));
      return;
    }
    const { file, status } = await resolveStaticFile(root, url.pathname);
    if (!file) {
      if (status === 404 && ['GET','HEAD'].includes(req.method) && (req.headers.accept ?? '').includes('text/html')) {
        const page = await readFile(resolve(root, '404.html')).catch(() => null);
        if (page) { res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8', 'X-Robots-Tag':'noindex, nofollow' }); res.end(req.method === 'HEAD' ? undefined : page); return; }
      }
      res.writeHead(status).end(); return;
    }
    res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    res.writeHead(500);
    res.end("Local build rehearsal failed.");
  }
}).listen(Number(process.env.BURGER_LOCAL_PORT ?? 4173), "127.0.0.1", function () {
  console.log(`Local build: http://127.0.0.1:${this.address().port}`);
});
