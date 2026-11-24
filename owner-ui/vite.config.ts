import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {createReadStream} from 'node:fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/admin/',
    plugins: [react(), tailwindcss(), {
      name: 'owner-storefront-product-photos',
      configureServer(server) {
        const photos = path.join(import.meta.dirname, '../frontend/public/assets/products');
        server.middlewares.use('/assets/products', (request, response, next) => {
          const file = /^\/([a-z0-9-]+-384\.webp)(?:\?.*)?$/.exec(request.url ?? '')?.[1];
          if (!file || request.method !== 'GET') return next();
          const stream = createReadStream(path.join(photos, file));
          stream.once('error', next);
          stream.once('open', () => {
            response.setHeader('Content-Type', 'image/webp');
            stream.pipe(response);
          });
        });
      },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: process.env.BURGER_DEV_API_ORIGIN || 'http://127.0.0.1:5449',
          changeOrigin: true,
          secure: false,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
