import { once } from "node:events";
import { test as base } from "@playwright/test";

// Serve the freshly generated official package without a real API upstream.
export const test = base.extend({
  ownerOrigin: [async ({}, use) => {
    process.env.BURGER_LOCAL_PORT = "0";
    const { server } = await import("../../scripts/serve-built-local.mjs");
    if (!server.listening) await once(server, "listening");
    try {
      await use(`http://127.0.0.1:${server.address().port}`);
    } finally {
      // All test contexts have finished. Close outstanding media requests as well.
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, { scope: "worker" }],
  baseURL: async ({ ownerOrigin }, use) => { await use(ownerOrigin); },
  context: async ({ context, ownerOrigin }, use) => {
    // Page-level provider fixtures still take precedence over this network boundary.
    await context.route("**/*", route => {
      const origin = new URL(route.request().url()).origin;
      return origin === ownerOrigin ? route.continue() : route.abort("blockedbyclient");
    });
    await use(context);
  },
});
export { expect } from "@playwright/test";
