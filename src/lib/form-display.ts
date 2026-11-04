import type { RecordKind } from "./doc-types";
import { FIELDS, type FormValues } from "./fields";
import { formatValue } from "./display";
import { normalizeInput, validateInput } from "./normalize";

const FORMATTED_INPUTS = new Set(["cpf", "cpf_cnpj", "cep", "phone", "placa"]);

/** Converte valores armazenados para o formato de digitação (com máscara). */
export function toDisplayValues(kind: RecordKind, values: FormValues): FormValues {
  const out: FormValues = {};
  for (const def of FIELDS[kind]) {
    const v = values[def.key] ?? "";
    out[def.key] = v && FORMATTED_INPUTS.has(def.input) ? formatValue(def, v) : v;
  }
  return out;
}

export function displayValue(kind: RecordKind, key: string, v: string): string {
  const def = FIELDS[kind].find((f) => f.key === key);
  return def && v && FORMATTED_INPUTS.has(def.input) ? formatValue(def, v) : v;
}

/** Erros de formato do formulário (validação no cliente; o servidor revalida). */
export function formErrors(kind: RecordKind, values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of FIELDS[kind]) {
    const v = normalizeInput(def.input, values[def.key] ?? "");
    const err = validateInput(def, v);
    if (err) errors[def.key] = err;
  }
  return errors;
}

/** Máscara de digitação leve para campos com formato fixo. */
export function maskTyping(input: string, raw: string): string {
  const d = raw.replace(/\D/g, "");
  switch (input) {
    case "cpf":
      return d
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    case "cep":
      return d.slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
    case "phone": {
      const x = d.slice(0, 11);
      if (x.length <= 2) return x;
      if (x.length <= 6) return `(${x.slice(0, 2)}) ${x.slice(2)}`;
      if (x.length <= 10) return `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`;
      return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
    }
    case "cpf_cnpj":
      if (d.length <= 11) return maskTyping("cpf", d);
      return d
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    case "placa":
      return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
    case "chassi":
      return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    case "digits":
    case "renavam":
    case "cnh_registro":
      return d.slice(0, 20);
    case "year":
      return d.slice(0, 4);
    default:
      return raw;
  }
}
