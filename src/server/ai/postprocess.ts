import type { DocType } from "@/lib/doc-types";
import type { DocSchema } from "@/lib/extraction-schemas";
import type { ExtractedField } from "@/lib/extraction-types";
import { HIGH_CONFIDENCE } from "@/lib/field-meta";
import { normalizeExtracted } from "@/lib/normalize";
import type { ProviderOutput } from "./types";

export interface PostProcessed {
  detectedType: string | null;
  matchesExpected: boolean;
  legibility: ProviderOutput["legibility"];
  fields: Record<string, ExtractedField>;
  warnings: string[];
  missingFields: string[];
}

/**
 * Etapas 8 e 9 do pipeline: valida/normaliza cada campo e atribui o nível de
 * confiança (verde/amarelo/vermelho). Nunca cria valores que o provedor não
 * devolveu.
 */
export function postProcess(expected: DocType, schema: DocSchema, out: ProviderOutput): PostProcessed {
  const fields: Record<string, ExtractedField> = {};
  const missing: string[] = [];
  const cap = out.maxConfidence ?? 1;

  for (const def of schema.fields) {
    const raw = out.fields[def.key] ?? { value: null, confidence: 0 };
    const confidence = Math.max(0, Math.min(cap, Number.isFinite(raw.confidence) ? raw.confidence : 0));
    const n = normalizeExtracted(def.format, raw.value, def.options);
    const notes: string[] = [];

    if (n.value === null || n.value === "") {
      if (raw.value && !n.valid) {
        // Havia algo, mas não foi possível interpretar (ex.: data malformada)
        fields[def.key] = { value: null, confidence: 0, status: "conflict", raw: raw.value, notes: [n.message ?? "Valor ilegível ou fora do formato."] };
      } else {
        fields[def.key] = { value: null, confidence: 0, status: "missing", raw: raw.value, notes: ["Não identificado no documento."] };
      }
      missing.push(def.key);
      continue;
    }

    let status: ExtractedField["status"] = confidence >= HIGH_CONFIDENCE ? "high" : "review";
    if (n.adjusted) {
      status = "review";
      notes.push("Caracteres ambíguos foram ajustados automaticamente (ex.: O→0, I→1). Confira.");
    }
    if (!n.valid) {
      // Registro da CNH com DV divergente pode ser erro de leitura: amarelo.
      status = def.format === "cnh_registro" && /^\d{11}$/.test(n.value) ? "review" : "conflict";
      if (n.message) notes.push(n.message);
    }
    if (out.legibility === "parcial" && status === "high" && confidence < 0.95) status = "review";
    if (confidence < HIGH_CONFIDENCE && status === "high") status = "review";

    fields[def.key] = { value: n.value, confidence, status, raw: raw.value, notes };
  }

  const warnings = [...out.warnings];
  const detected = out.documentTypeDetected && out.documentTypeDetected !== "desconhecido" ? out.documentTypeDetected : null;
  const matchesExpected = out.matchesExpected && (!detected || detected === expected);
  if (out.legibility === "ilegivel" && !warnings.some((w) => /ileg/i.test(w))) {
    warnings.push("Documento ilegível: envie um novo arquivo com melhor qualidade.");
  }

  return { detectedType: out.documentTypeDetected, matchesExpected, legibility: out.legibility, fields, warnings, missingFields: missing };
}
