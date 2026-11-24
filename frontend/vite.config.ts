import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {defineConfig, loadEnv} from 'vite';
import { HeroFirstPaint } from './src/components/HeroArtwork.tsx';

const source = new URL('./src/', import.meta.url);

function firstPaintHero() {
  const tokens = readFileSync(new URL('styles/design-system.css', source), 'utf8').match(/:root\s*\{[^}]*\}/)?.[0];
  if (!tokens) throw new Error('The storefront design tokens are required for the initial Hero.');
  const heroStyles = readFileSync(new URL('components/HeroAnimation.css', source), 'utf8');
  const hero = renderToStaticMarkup(createElement(HeroFirstPaint));
  return {
    name: 'storefront-first-paint',
    transformIndexHtml: {
      order: 'post' as const,
      handler: (html: string) => {
        if (!html.includes('<div id="root"></div>')) return html;
        return {
        html: html.replace('<div id="root"></div>', `<div id="root">${hero}</div>`),
        tags: [{ tag: 'style', children: `${tokens} body{margin:0;background:var(--tbh-porcelain)} ${heroStyles}`, injectTo: 'head' as const }],
        };
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'BURGER_DEV_');
  const api = new URL(env.BURGER_DEV_API_ORIGIN || 'http://localhost:5041');
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.pathname !== '/' || api.search || api.hash) {
    throw new Error('BURGER_DEV_API_ORIGIN must be an HTTP(S) origin.');
  }
  return {
    plugins: [react(), tailwindcss(), firstPaintHero()],
    build: { rollupOptions: { input: { main: path.resolve(import.meta.dirname, 'index.html'), rights: path.resolve(import.meta.dirname, 'rights.html') } } },
    resolve: {
      alias: {
        '@/lib/api-client': path.resolve(import.meta.dirname, '../shared/storefront/lib/api-client.ts'),
        '@': import.meta.dirname,
      },
    },
    server: {
      // Same local API target as the existing storefront. Never falls back to production.
      proxy: { '/api': { target: api.origin, changeOrigin: true } },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
