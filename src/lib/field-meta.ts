import type { DocType } from "./doc-types";

/**
 * Situação de confiança de cada campo do formulário.
 *  - high     → verde: extraído com alta confiança e formato válido
 *  - review   → amarelo: precisa de conferência
 *  - missing  → vermelho: não identificado nos documentos
 *  - conflict → vermelho: formato inválido ou divergência entre documentos
 *  - manual   → preenchido/corrigido pelo usuário
 *  - confirmed→ conferido pelo usuário sem alteração
 */
export type FieldStatus = "high" | "review" | "missing" | "conflict" | "manual" | "confirmed";

export interface FieldSourceRef {
  docType: DocType;
  field: string;
  extractionId: string;
  documentIds: string[];
  provider?: string;
}

export interface FieldMeta {
  status: FieldStatus;
  confidence?: number;
  source?: FieldSourceRef;
  notes?: string[];
  /** Valor original sugerido pela IA (para auditoria da origem). */
  suggested?: string | null;
  updatedAt?: string;
}

export type FieldMetaMap = Record<string, FieldMeta>;

export const STATUS_STYLE: Record<FieldStatus, { label: string; tone: "green" | "yellow" | "red" | "blue" | "slate" }> = {
  high: { label: "Alta confiança", tone: "green" },
  review: { label: "Conferir", tone: "yellow" },
  missing: { label: "Não identificado", tone: "red" },
  conflict: { label: "Inconsistente", tone: "red" },
  manual: { label: "Editado", tone: "blue" },
  confirmed: { label: "Conferido", tone: "green" },
};

export const HIGH_CONFIDENCE = 0.85;
