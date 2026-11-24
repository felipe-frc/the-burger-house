import { showcaseEnabled } from './ownerShowcase';

/** Same-origin Owner API. Session credentials remain exclusively in HttpOnly cookies. */
export class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

let csrfToken: string | undefined;
let csrfInitialization: Promise<string> | undefined;
let sessionGeneration = 0;
export function clearAdminCsrf() {
  csrfToken = undefined;
  csrfInitialization = undefined;
  sessionGeneration++;
}

function initializeCsrf(): Promise<string> {
  if (!csrfInitialization) {
    const pending = adminRequest<{ csrfToken: string }>('/api/admin/auth/login')
      .then(body => {
        if (typeof body?.csrfToken !== 'string' || !body.csrfToken)
          throw new AdminApiError(502, 'Resposta inválida da API. Verifique o proxy e tente novamente.');
        return body.csrfToken;
      }).finally(() => { if (csrfInitialization === pending) csrfInitialization = undefined; });
    csrfInitialization = pending;
  }
  return csrfInitialization;
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/admin/')) throw new Error('Rota administrativa inválida.');
  if (import.meta.env?.DEV && showcaseEnabled()) {
    const { showcaseRequest, ShowcaseError } = await import('./ownerShowcaseTransport');
    try { return structuredClone(showcaseRequest(path, init)) as T; }
    catch (error) {
      if (error instanceof ShowcaseError) throw new AdminApiError(error.status, error.message);
      throw error;
    }
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const generation = sessionGeneration;
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = csrfToken ?? await initializeCsrf();
    if (generation !== sessionGeneration)
      throw new AdminApiError(401, 'Sessão expirada ou credenciais inválidas.');
    headers.set('X-CSRF-TOKEN', token);
  }
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AdminApiError(0, 'API indisponível. Verifique a conexão e tente novamente.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/admin/auth/login' &&
      !(path === '/api/admin/auth/change-password' && body?.error === 'Senha atual inválida.')) {
      clearAdminCsrf();
      window.dispatchEvent(new Event('owner-session-expired'));
    }
    const messages: Record<number, string> = {
      400: 'Requisição inválida. Atualize a página e confira os campos.',
      401: 'Sessão expirada ou credenciais inválidas.',
      403: 'Acesso não autorizado.',
      404: 'Recurso não encontrado nesta API (HTTP 404).',
      409: 'Os dados mudaram. Atualize antes de tentar novamente.',
      429: 'Muitas tentativas. Aguarde antes de tentar novamente.',
    };
    const knownErrors = ['Credenciais inválidas.', 'Senha atual inválida.'];
    const message = knownErrors.includes(body?.error) ? body.error : messages[response.status];
    throw new AdminApiError(response.status, message ?? `Falha na API (HTTP ${response.status}). Tente novamente.`);
  }
  if (response.status !== 204 && body === null)
    throw new AdminApiError(502, 'Resposta inválida da API. Verifique o proxy e tente novamente.');
  if (generation === sessionGeneration && typeof body?.csrfToken === 'string') csrfToken = body.csrfToken;
  return body as T;
}

export async function getOwnerSession(signal?: AbortSignal) {
  return adminRequest<{ role: string; csrfToken: string }>('/api/admin/auth/me', { signal });
}

export async function loginOwner(email: string, password: string) {
  clearAdminCsrf();
  await adminRequest('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
  return getOwnerSession();
}

export async function logoutOwner() {
  await adminRequest('/api/admin/auth/logout', { method: 'POST' });
  clearAdminCsrf();
}
