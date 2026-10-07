export class AdminError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export function createAdminClient(fetcher = globalThis.fetch.bind(globalThis)) {
  let csrf = "";
  return async function request(path, options = {}) {
    const method = options.method || "GET";
    const response = await fetcher(`/api/admin/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRF-TOKEN": csrf } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      // Only fixed local messages: never render arbitrary server/proxy error content or credentials.
      const message =
        response.status === 401
          ? "Credenciais inválidas ou sessão expirada."
          : response.status === 429
            ? "Muitas tentativas. Aguarde um minuto."
            : response.status === 409
              ? "Registro alterado ou operação não permitida. Atualize a página."
              : response.status === 400
                ? "Confira os campos e o período informado."
                : "Não foi possível concluir. Tente novamente.";
      throw new AdminError(message, response.status);
    }
    if (data?.csrfToken) csrf = data.csrfToken;
    return data;
  };
}
