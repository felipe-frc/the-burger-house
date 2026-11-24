const DEFAULT_TIMEOUT_MS = 10_000;

// Hosted storefront traffic must use the same-origin Vercel proxy, including
// cookies and uploaded images. Local development can opt into a direct API.
const configuredBaseUrl = String(
  import.meta.env?.PROD ? "" : (import.meta.env?.["VITE_API_BASE_URL"] ?? ""),
)
  .trim()
  .replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${configuredBaseUrl}${normalizedPath}`;
}

export function resolveApiAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  // Uploaded images use the same-origin API proxy; reject executable/foreign URLs.
  if (/^\/api\/product-images\/[a-zA-Z0-9._-]+$/.test(path)) return apiUrl(path);
  return null;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort("timeout"), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  if (externalSignal?.aborted) abortFromExternal();

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: (() => {
        const headers = new Headers(init.headers);
        if (!headers.has("Accept")) headers.set("Accept", "application/json");
        if (init.body && !headers.has("Content-Type"))
          headers.set("Content-Type", "application/json");
        return headers;
      })(),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload =
      response.status === 204
        ? null
        : /\bjson\b/i.test(contentType)
          ? await response.json()
          : await response.text();

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : payload && typeof payload === "object" && "errors" in payload
            ? Object.values(payload.errors as Record<string, string[]>)
                .flat()
                .join(" ")
            : `A API respondeu com o status ${response.status}.`;
      throw new ApiError(message, response.status, payload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError("A conexão demorou demais. Tente novamente.", 408);
    }
    throw new ApiError("Não foi possível conectar à loja. Verifique sua conexão.", 0, error);
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
