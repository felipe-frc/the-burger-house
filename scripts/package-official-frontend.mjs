import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const origin = process.env.BURGER_BUILD_API_ORIGIN;
if (!origin) throw new Error('Set BURGER_BUILD_API_ORIGIN to the approved HTTPS API origin before packaging.');
const url = new URL(origin);
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('BURGER_BUILD_API_ORIGIN must be an HTTPS origin without credentials, path or query.');
}
const output = resolve(root, process.env.BURGER_BUILD_OUTPUT_DIR || '.vercel/output');
const existing = await readdir(output).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
if (existing.length) throw new Error('Build output directory must be empty to prevent mixing storefront generations. Use a fresh BURGER_BUILD_OUTPUT_DIR for local validation.');
const destination = resolve(output, 'static');
await mkdir(destination, { recursive: true });
const frontendBuild = resolve(root, process.env.BURGER_BUILD_FRONTEND_DIR || 'frontend/dist');
await cp(frontendBuild, destination, { recursive: true });
const ownerBuild = resolve(root, process.env.BURGER_BUILD_OWNER_DIR || 'owner-ui/dist');
const ownerHtml = await readFile(resolve(ownerBuild, 'index.html'), 'utf8');
if (!ownerHtml.includes('/admin/assets/')) throw new Error('Build the Owner with base /admin/ before packaging.');
await cp(ownerBuild, resolve(destination, 'admin'), { recursive: true });
const analyticsId = process.env.BURGER_BUILD_GA4_MEASUREMENT_ID;
if (analyticsId && !/^G-[A-Z0-9]{6,20}$/.test(analyticsId)) throw new Error('Invalid public GA4 Measurement ID.');
const analyticsScript = analyticsId ? ' https://www.googletagmanager.com' : '';
const analyticsConnect = analyticsId ? ' https://www.google-analytics.com https://region1.google-analytics.com' : '';
const csp = `default-src 'self'; script-src 'self'${analyticsScript}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://api.maptiler.com; media-src 'self'; worker-src 'self' blob:; connect-src 'self' https://api.maptiler.com https://cdn.maptiler.com https://viacep.com.br${analyticsConnect}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`;
await writeFile(resolve(output, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/(.*)', headers: { 'Content-Security-Policy': csp }, continue: true },
  { handle: 'filesystem' },
  { src: '/(?:menu/?)?', dest: '/index.html' },
  { src: '/(.*)', dest: '/404.html', status: 404 },
] }, null, 2));
await import('./finalize-vercel-output.mjs');
const html = await readFile(resolve(destination, 'index.html'), 'utf8');
if (!html.includes('id="root"')) throw new Error('The official React entry was not packaged.');
console.log('Official storefront and React Owner packaged. No deployment performed.');
