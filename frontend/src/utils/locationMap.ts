/** Validate local configuration only; provider permissions are checked by MapTiler. */
export function readMapTilerKey(value: unknown): { key: string; error?: never } | { key?: never; error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: 'Chave MapTiler não configurada.' };
  }
  // Reject controls before trimming: malformed input must never become an API request.
  if (Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return { error: 'VITE_MAPTILER_KEY contém caractere de controle. Reconfigure a variável local.' };
  }
  const key = value.trim();
  if (/\s/u.test(key)) {
    return { error: 'VITE_MAPTILER_KEY contém espaços internos. Reconfigure a variável local.' };
  }
  return { key };
}

/** Never return the provider's raw message or URL: either can contain the key. */
export function mapFailureMessage(error: unknown): string {
  const details = error && typeof error === 'object' ? error as { status?: unknown; message?: unknown; name?: unknown } : {};
  const message = typeof details.message === 'string' ? details.message : '';
  if (/worker/i.test(message)) {
    return 'O Worker do mapa não iniciou. Verifique o arquivo JavaScript, seu MIME e a política CSP.';
  }
  if (/webgl/i.test(message)) {
    return 'Não foi possível inicializar WebGL 2 neste navegador.';
  }
  if (details.name === 'SecurityError' || /content security policy/i.test(message)) {
    return 'A política de segurança bloqueou um recurso do mapa.';
  }
  if (details.status === 401 || details.status === 403) {
    return `Acesso ao MapTiler negado (HTTP ${details.status}). Confira a chave e as origens autorizadas.`;
  }
  if (details.status === 404) return 'Estilo ou recurso cartográfico não encontrado (HTTP 404).';
  if (details.status === 429) return 'Limite de requisições do MapTiler atingido (HTTP 429).';
  if (typeof details.status === 'number' && details.status >= 500) {
    return 'O serviço cartográfico está temporariamente indisponível.';
  }
  return 'Falha ao carregar um recurso cartográfico. Verifique a conexão e os bloqueios de rede.';
}
