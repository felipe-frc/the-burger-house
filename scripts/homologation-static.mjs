import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { isOwnerSpaRoute } from './owner-spa-route.mjs';

export async function resolveStaticFile(staticRoot, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return { status: 400 }; }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..')) return { status: 400 };
  // A packaging mistake must not turn local configuration or private key material into public assets.
  if (decoded.split('/').some(part => part.startsWith('.')) ||
      /\.(?:key|pem|pfx|p12|dpapi|db|sqlite|sqlite3)$/i.test(decoded)) return { status: 404 };
  const root = resolve(staticRoot);
  const file = resolve(root, '.' + decoded);
  if (file !== root && !file.startsWith(root + sep)) return { status: 400 };
  if ((await stat(file).catch(() => null))?.isFile()) return { status: 200, file };
  // Assets must never receive the SPA document, including missing extensionless assets.
  if (/^\/admin\/assets(?:\/|$)/.test(decoded) || extname(decoded)) return { status: 404 };
  const entry = isOwnerSpaRoute(decoded) ? 'admin/index.html'
    : /^\/(?:menu\/?)?$/.test(decoded) ? 'index.html' : null;
  if (!entry) return { status: 404 };
  const fallback = resolve(root, entry);
  return (await stat(fallback).catch(() => null))?.isFile() ? { status: 200, file: fallback } : { status: 404 };
}
