import type { DocType } from "./doc-types";
import type { FieldStatus } from "./field-meta";

export type Legibility = "boa" | "parcial" | "ilegivel";

export interface ExtractedField {
  value: string | null;
  confidence: number;
  status: FieldStatus;
  /** Valor bruto devolvido pelo provedor, antes da normalização. */
  raw?: string | null;
  notes: string[];
}

export interface ExtractionSummary {
  id: string;
  docType: DocType;
  documentIds: string[];
  provider: string;
  model: string | null;
  detectedType: string | null;
  matchesExpected: boolean;
  legibility: Legibility;
  fields: Record<string, ExtractedField>;
  warnings: string[];
  missingFields: string[];
  error: string | null;
  createdAt: string;
}

/** Eventos do processamento em tempo real (NDJSON). */
export type ProcessEvent =
  | { type: "start"; docTypes: DocType[]; provider: string }
  | { type: "stage"; docType: DocType; stage: "preparando" | "analisando" | "validando" | "concluido" | "erro" }
  | { type: "result"; docType: DocType; extraction: ExtractionSummary }
  | { type: "doc_error"; docType: DocType; message: string; code: "ilegivel" | "incompativel" | "falha" }
  | { type: "organizing" }
  | { type: "error"; code: "ai_not_configured" | "external_disabled" | "forbidden" | "not_found" | "falha"; message: string }
  | { type: "done"; extractions: ExtractionSummary[] };
