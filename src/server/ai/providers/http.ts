import "server-only";
import { ProviderError } from "../types";

export function aiTimeoutMs(): number {
  const n = Number(process.env.AI_TIMEOUT_MS ?? 90000);
  return Number.isFinite(n) && n > 0 ? n : 90000;
}

/** POST JSON com timeout e novas tentativas para erros transitórios (429/5xx). */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, label: string, signal?: AbortSignal): Promise<unknown> {
  const attempts = 3;
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), aiTimeoutMs());
    signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      let detail = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        detail = j?.error?.message ?? detail;
      } catch {}
      if (res.status === 401 || res.status === 403) throw new ProviderError(`${label}: chave de API inválida ou sem permissão.`);
      if (res.status === 400 || res.status === 413 || res.status === 422) throw new ProviderError(`${label}: requisição rejeitada (${detail}).`);
      lastErr = new ProviderError(`${label}: erro ${res.status} (${detail}).`, true);
      if (![408, 429, 500, 502, 503, 504, 529].includes(res.status)) throw lastErr;
    } catch (err) {
      if (err instanceof ProviderError && !err.retryable) throw err;
      lastErr = err instanceof ProviderError ? err : new ProviderError(`${label}: ${(err as Error).name === "AbortError" ? "tempo limite excedido" : (err as Error).message}`, true);
    } finally {
      clearTimeout(timer);
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
  }
  throw lastErr ?? new ProviderError(`${label}: falha desconhecida.`);
}
