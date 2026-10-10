import { defineConfig } from "vite";
import { resolve } from "node:path";

function adminFallback(server) {
  server.middlewares.use((request, _response, next) => {
    if (/^\/admin(?:\/|$)/.test(request.url || "")) request.url = "/admin/index.html";
    next();
  });
}
export default defineConfig({
  plugins: [
    {
      name: "owner-routes",
      configureServer: adminFallback,
      configurePreviewServer: adminFallback,
    },
  ],
  server: { proxy: { "/api/admin": { target: "http://localhost:5041", changeOrigin: true } } },
  build: {
    rollupOptions: {
      input: {
        shop: resolve("index.html"),
        admin: resolve("admin/index.html"),
        privacy: resolve("privacy.html"),
      },
    },
  },
});
