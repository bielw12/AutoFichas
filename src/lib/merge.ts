import type { RecordKind } from "./doc-types";
import type { ExtractionSummary } from "./extraction-types";
import { HIGH_CONFIDENCE, type FieldMeta, type FieldMetaMap } from "./field-meta";
import { FIELDS, type FormValues, type TransformName } from "./fields";
import { normalizeInput, validateInput } from "./normalize";

export interface Proposal {
  value: string;
  meta: FieldMeta;
}

export function applyTransform(t: TransformName | undefined, value: string): { value: string; ok: boolean } {
  if (!t || t === "none") return { value, ok: true };
  if (t === "upper") return { value: value.toUpperCase(), ok: true };
  if (t === "tonsToKg") {
    const s = value.toUpperCase().replace(/\s+/g, "");
    const m = s.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return { value: "", ok: false };
    const num = Number(m[1].replace(",", "."));
    if (!Number.isFinite(num)) return { value: "", ok: false };
    const isKg = /KG/.test(s);
    const isTon = /\dT|T$|TON/.test(s) && !isKg;
    if (isKg) return { value: String(Math.round(num)), ok: true };
    if (isTon || num < 100) return { value: String(Math.round(num * 1000)), ok: true };
    return { value: String(Math.round(num)), ok: true };
  }
  return { value, ok: true };
}

/**
 * Converte os resultados de extração em propostas de preenchimento para a
 * ficha, respeitando a prioridade das origens de cada campo.
 */
export function buildProposals(kind: RecordKind, extractions: ExtractionSummary[]): Record<string, Proposal> {
  const byType = new Map(extractions.filter((e) => !e.error).map((e) => [e.docType, e]));
  const out: Record<string, Proposal> = {};

  for (const def of FIELDS[kind]) {
    if (!def.sources?.length) continue;
    const processed = def.sources.filter((s) => byType.has(s.docType));
    if (!processed.length) continue;

    let chosen: Proposal | null = null;
    for (const src of processed) {
      const ex = byType.get(src.docType)!;
      const f = ex.fields[src.field];
      if (!f || f.value === null || f.value === "") continue;

      const transformed = applyTransform(src.transform, f.value);
      if (!transformed.ok || !transformed.value) continue;
      const value = normalizeInput(def.input, transformed.value);
      const formatError = validateInput(def, value);

      const notes = [...(f.notes ?? [])];
      let status = f.status;
      if (formatError) {
        status = "conflict";
        notes.push(formatError);
      } else if (src.alwaysReview) {
        if (status === "high") status = "review";
        notes.push(src.alwaysReview);
      } else if (src.transform && src.transform !== "none") {
        if (status === "high") status = "review";
      }
      if (status === "high" && f.confidence < HIGH_CONFIDENCE) status = "review";

      chosen = {
        value,
        meta: {
          status,
          confidence: f.confidence,
          notes: Array.from(new Set(notes)),
          suggested: value,
          source: { docType: src.docType, field: src.field, extractionId: ex.id, documentIds: ex.documentIds, provider: ex.provider },
          updatedAt: ex.createdAt,
        },
      };
      break;
    }

    if (!chosen) {
      const first = processed[0];
      const ex = byType.get(first.docType)!;
      chosen = {
        value: "",
        meta: {
          status: "missing",
          confidence: 0,
          notes: ["Não identificado no documento — preencha manualmente."],
          suggested: null,
          source: { docType: first.docType, field: first.field, extractionId: ex.id, documentIds: ex.documentIds, provider: ex.provider },
          updatedAt: ex.createdAt,
        },
      };
    }
    out[def.key] = chosen;
  }
  return out;
}

/**
 * Aplica propostas a um formulário sem sobrescrever o que o usuário já
 * corrigiu ou conferiu manualmente.
 */
export function applyProposals(
  values: FormValues,
  meta: FieldMetaMap,
  proposals: Record<string, Proposal>,
  opts: { onlyKeys?: string[]; force?: boolean } = {},
): { values: FormValues; meta: FieldMetaMap } {
  const nextValues = { ...values };
  const nextMeta = { ...meta };
  for (const [key, p] of Object.entries(proposals)) {
    if (opts.onlyKeys && !opts.onlyKeys.includes(key)) continue;
    const current = meta[key];
    const userTouched = current && (current.status === "manual" || current.status === "confirmed");
    if (!opts.force && userTouched && (values[key] ?? "") !== "") continue;
    if (!p.value && (values[key] ?? "") !== "" && !opts.force) {
      // Não apaga valor existente porque o novo documento não trouxe o dado.
      nextMeta[key] = { ...p.meta, status: current?.status ?? "review", notes: ["Não encontrado no novo documento; valor anterior mantido."] };
      continue;
    }
    nextValues[key] = p.value;
    nextMeta[key] = p.meta;
  }
  return { values: nextValues, meta: nextMeta };
}

export interface ProposalDiff {
  key: string;
  current: string;
  proposed: string;
  meta: FieldMeta;
}

/** Ignora diferenças apenas de maiúsculas/minúsculas, acentos e espaços. */
function comparable(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Diferenças entre os valores atuais e as novas propostas (reprocessamento). */
export function diffProposals(values: FormValues, proposals: Record<string, Proposal>): ProposalDiff[] {
  return Object.entries(proposals)
    .filter(([key, p]) => p.value && comparable(p.value) !== comparable(values[key] ?? ""))
    .map(([key, p]) => ({ key, current: values[key] ?? "", proposed: p.value, meta: p.meta }));
}
