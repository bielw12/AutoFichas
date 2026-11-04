import "server-only";
import { AnthropicProvider } from "./providers/anthropic";
import { LocalOcrProvider } from "./providers/local-ocr";
import { OpenAIProvider } from "./providers/openai";
import type { ExtractionProvider } from "./types";

export interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  external: boolean;
  model: string | null;
  message: string;
}

const LABELS: Record<string, string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  local: "OCR local (Tesseract)",
  none: "Nenhum",
};

/** Lê a configuração do provedor sem expor chaves. */
export function providerStatus(): ProviderStatus {
  const id = (process.env.AI_PROVIDER || "none").toLowerCase();
  if (id === "anthropic") {
    const ok = !!process.env.ANTHROPIC_API_KEY;
    return {
      id,
      label: LABELS[id],
      configured: ok,
      external: true,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      message: ok ? "Integração configurada." : "Defina ANTHROPIC_API_KEY nas variáveis de ambiente do servidor.",
    };
  }
  if (id === "openai") {
    const ok = !!process.env.OPENAI_API_KEY;
    return {
      id,
      label: LABELS[id],
      configured: ok,
      external: true,
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      message: ok ? "Integração configurada." : "Defina OPENAI_API_KEY nas variáveis de ambiente do servidor.",
    };
  }
  if (id === "local") {
    return { id, label: LABELS[id], configured: true, external: false, model: "tesseract-por", message: "OCR local ativo — nenhum dado sai do servidor." };
  }
  return {
    id: "none",
    label: LABELS.none,
    configured: false,
    external: false,
    model: null,
    message: "A extração automática por IA ainda não foi configurada. Defina AI_PROVIDER e a chave correspondente (veja .env.example).",
  };
}

let override: ExtractionProvider | null = null;

/** Somente para testes automatizados. */
export function __setProviderForTests(p: ExtractionProvider | null) {
  override = p;
}

export function getProvider(): ExtractionProvider | null {
  if (override) return override;
  const st = providerStatus();
  if (!st.configured) return null;
  if (st.id === "anthropic") return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!, st.model ?? undefined);
  if (st.id === "openai") return new OpenAIProvider(process.env.OPENAI_API_KEY!, st.model ?? undefined);
  if (st.id === "local") return new LocalOcrProvider();
  return null;
}
