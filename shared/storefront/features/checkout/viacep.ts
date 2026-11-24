import { digits } from "./validation";

export type ViaCepAddress = {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
};

export class ViaCepError extends Error {
  constructor(readonly kind: "invalid" | "not-found" | "timeout" | "unavailable" | "cancelled") {
    super(kind);
    this.name = "ViaCepError";
  }
}

export async function lookupCep(value: string, signal?: AbortSignal): Promise<ViaCepAddress> {
  const cep = digits(value);
  if (cep.length !== 8) throw new ViaCepError("invalid");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("timeout"), 5_000);
  const abortFromExternal = () => controller.abort("external");
  signal?.addEventListener("abort", abortFromExternal, { once: true });
  if (signal?.aborted) abortFromExternal();

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new ViaCepError("unavailable");
    const result = (await response.json()) as {
      erro?: boolean;
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
    };
    if (result.erro) throw new ViaCepError("not-found");
    return {
      zipCode: result.cep ?? value,
      street: result.logradouro ?? "",
      neighborhood: result.bairro ?? "",
      city: result.localidade ?? "",
    };
  } catch (error) {
    if (error instanceof ViaCepError) throw error;
    if (controller.signal.aborted) {
      throw new ViaCepError(controller.signal.reason === "timeout" ? "timeout" : "cancelled");
    }
    throw new ViaCepError("unavailable");
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromExternal);
  }
}
