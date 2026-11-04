import type { DocType } from "@/lib/doc-types";
import type { DocSchema } from "@/lib/extraction-schemas";
import type { Legibility } from "@/lib/extraction-types";

export interface ProviderFile {
  name: string;
  /** Tipo real detectado (application/pdf, image/jpeg, image/png). */
  mime: string;
  data: Buffer;
}

export interface ProviderInput {
  expectedType: DocType;
  schema: DocSchema;
  files: ProviderFile[];
  signal?: AbortSignal;
}

/** Saída bruta de um provedor, antes de normalização/validação. */
export interface ProviderOutput {
  documentTypeDetected: string | null;
  matchesExpected: boolean;
  legibility: Legibility;
  fields: Record<string, { value: string | null; confidence: number }>;
  warnings: string[];
  model: string | null;
  /** Provedores heurísticos limitam a confiança máxima (nunca "verde" automático). */
  maxConfidence?: number;
}

export interface ExtractionProvider {
  readonly id: "anthropic" | "openai" | "local";
  readonly label: string;
  /** Envia dados para fora do servidor (exige autorização LGPD). */
  readonly external: boolean;
  readonly model: string | null;
  extract(input: ProviderInput): Promise<ProviderOutput>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
