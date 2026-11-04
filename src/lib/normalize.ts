import type { ValueFormat } from "./extraction-schemas";
import type { InputKind, RecordFieldDef } from "./fields";
import {
  CNH_CATEGORIES,
  isValidCEP,
  isValidChassi,
  isValidCnhRegistro,
  isValidCPF,
  isValidCpfCnpj,
  isValidEmail,
  isValidISODate,
  isValidPhone,
  isValidPlaca,
  isValidRenavam,
  isValidUF,
  normalizePlaca,
  onlyDigits,
  parseDateToISO,
} from "./validators";

export interface NormalizedValue {
  value: string | null;
  /** Formato válido (não significa autenticidade). */
  valid: boolean;
  /** Houve correção automática de caracteres ambíguos — exige conferência. */
  adjusted: boolean;
  message?: string;
}

/** Letras frequentemente confundidas com dígitos por OCR/visão. */
const DIGIT_CONFUSION: Record<string, string> = {
  O: "0", o: "0", Q: "0", D: "0",
  I: "1", l: "1", i: "1", "|": "1",
  Z: "2", z: "2",
  S: "5", s: "5",
  G: "6", b: "6",
  T: "7",
  B: "8",
};

/**
 * Para campos estritamente numéricos, converte letras ambíguas em dígitos.
 * Sinaliza `adjusted` para forçar revisão humana.
 */
export function fixNumeric(raw: string): { value: string; adjusted: boolean } {
  const compact = raw.replace(/[\s.\-/]/g, "");
  let adjusted = false;
  let out = "";
  for (const ch of compact) {
    if (/\d/.test(ch)) out += ch;
    else if (DIGIT_CONFUSION[ch] !== undefined) {
      out += DIGIT_CONFUSION[ch];
      adjusted = true;
    }
  }
  return { value: out, adjusted };
}

function clean(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  if (!s || /^(null|n\/?a|nao consta|não consta|-|—|ilegivel|ilegível)$/i.test(s)) return null;
  return s;
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeExtracted(format: ValueFormat, raw: unknown, options?: string[]): NormalizedValue {
  const s = clean(raw);
  if (s === null) return { value: null, valid: true, adjusted: false };

  switch (format) {
    case "text":
      return { value: s, valid: true, adjusted: false };
    case "name":
      return { value: s, valid: /[A-Za-zÀ-ÿ]{2,}/.test(s), adjusted: false };
    case "cpf": {
      const { value, adjusted } = fixNumeric(s);
      const valid = isValidCPF(value);
      return { value, valid, adjusted, message: valid ? undefined : "CPF com formato ou dígitos verificadores inválidos." };
    }
    case "cpf_cnpj": {
      const { value, adjusted } = fixNumeric(s);
      const valid = isValidCpfCnpj(value);
      return { value, valid, adjusted, message: valid ? undefined : "CPF/CNPJ com formato ou dígitos verificadores inválidos." };
    }
    case "date": {
      const iso = parseDateToISO(s);
      return iso ? { value: iso, valid: true, adjusted: false } : { value: null, valid: false, adjusted: false, message: `Data não reconhecida: "${s}".` };
    }
    case "uf": {
      const v = stripAccents(s).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      const valid = isValidUF(v);
      return { value: v, valid, adjusted: false, message: valid ? undefined : "UF inválida." };
    }
    case "cep": {
      const { value, adjusted } = fixNumeric(s);
      const valid = isValidCEP(value);
      return { value, valid, adjusted, message: valid ? undefined : "CEP deve ter 8 dígitos." };
    }
    case "digits": {
      const { value, adjusted } = fixNumeric(s);
      return { value: value || null, valid: value.length > 0, adjusted };
    }
    case "phone": {
      const { value, adjusted } = fixNumeric(s);
      const valid = isValidPhone(value);
      return { value, valid, adjusted, message: valid ? undefined : "Telefone inválido." };
    }
    case "placa": {
      const { value, adjusted } = normalizePlaca(s);
      const valid = isValidPlaca(value);
      return { value, valid, adjusted, message: valid ? undefined : "Placa fora do padrão (ABC1234 ou ABC1D23)." };
    }
    case "renavam": {
      const { value, adjusted } = fixNumeric(s);
      const padded = value.length >= 9 && value.length < 11 ? value.padStart(11, "0") : value;
      const valid = isValidRenavam(padded);
      return { value: padded, valid, adjusted, message: valid ? undefined : "Renavam com dígito verificador inválido." };
    }
    case "chassi": {
      let v = stripAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
      let adjusted = false;
      // VIN nunca contém I, O ou Q
      if (/[IOQ]/.test(v)) {
        v = v.replace(/I/g, "1").replace(/[OQ]/g, "0");
        adjusted = true;
      }
      const valid = isValidChassi(v);
      return { value: v, valid, adjusted, message: valid ? undefined : "Chassi deve ter 17 caracteres válidos." };
    }
    case "year": {
      const { value, adjusted } = fixNumeric(s);
      const y = Number(value.slice(0, 4));
      const valid = value.length === 4 && y >= 1950 && y <= new Date().getFullYear() + 2;
      return { value: value.slice(0, 4), valid, adjusted, message: valid ? undefined : "Ano inválido." };
    }
    case "cnh_categoria": {
      const v = stripAccents(s).toUpperCase().replace(/[^A-Z]/g, "");
      const valid = (CNH_CATEGORIES as readonly string[]).includes(v);
      return { value: v, valid, adjusted: false, message: valid ? undefined : "Categoria de CNH não reconhecida." };
    }
    case "cnh_registro": {
      const { value, adjusted } = fixNumeric(s);
      const v = value.length === 9 || value.length === 10 ? value.padStart(11, "0") : value;
      const valid = isValidCnhRegistro(v);
      return { value: v, valid, adjusted, message: valid ? undefined : "Registro da CNH com dígitos verificadores que não conferem." };
    }
    case "enum": {
      const target = stripAccents(s).toLowerCase().replace(/\s+/g, "");
      const match = (options ?? []).find((o) => stripAccents(o).toLowerCase().replace(/\s+/g, "") === target);
      if (match) return { value: match, valid: true, adjusted: false };
      const partial = (options ?? []).find((o) => target.includes(stripAccents(o).toLowerCase()));
      if (partial) return { value: partial, valid: true, adjusted: true };
      return { value: null, valid: false, adjusted: false, message: `Valor "${s}" fora das opções esperadas.` };
    }
  }
}

// ------------------------------------------------- Validação de formulário --

/**
 * Normaliza o valor digitado no formulário para armazenamento.
 * (CPF/CEP/telefone somente dígitos, placa maiúscula sem hífen, etc.)
 */
export function normalizeInput(input: InputKind, raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  switch (input) {
    case "cpf":
    case "cpf_cnpj":
    case "cep":
    case "phone":
    case "digits":
    case "renavam":
    case "cnh_registro":
    case "year":
      return onlyDigits(s);
    case "placa":
      return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    case "chassi":
      return s.toUpperCase().replace(/\s+/g, "");
    case "uf":
      return s.toUpperCase();
    case "number":
      return s.replace(/\s+/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    case "date":
      return parseDateToISO(s) ?? s;
    default:
      return s;
  }
}

/** Retorna mensagem de erro de formato ou null. Campos vazios não são erro aqui. */
export function validateInput(def: Pick<RecordFieldDef, "input" | "options">, value: string): string | null {
  if (!value) return null;
  switch (def.input) {
    case "cpf":
      return isValidCPF(value) ? null : "CPF inválido";
    case "cpf_cnpj":
      return isValidCpfCnpj(value) ? null : "CPF/CNPJ inválido";
    case "cep":
      return isValidCEP(value) ? null : "CEP deve ter 8 dígitos";
    case "phone":
      return isValidPhone(value) ? null : "Telefone inválido — use DDD + número";
    case "email":
      return isValidEmail(value) ? null : "E-mail inválido";
    case "date":
      return isValidISODate(value) ? null : "Data inválida";
    case "uf":
      return isValidUF(value) ? null : "UF inválida";
    case "placa":
      return isValidPlaca(value) ? null : "Placa fora do padrão (ABC1234 ou ABC1D23)";
    case "renavam":
      return isValidRenavam(value) ? null : "Renavam inválido (dígito verificador)";
    case "chassi":
      return isValidChassi(value) ? null : "Chassi deve ter 17 caracteres (sem I, O, Q)";
    case "cnh_registro":
      return /^\d{11}$/.test(value) ? null : "Registro deve ter 11 dígitos";
    case "year": {
      const y = Number(value);
      return /^\d{4}$/.test(value) && y >= 1950 && y <= new Date().getFullYear() + 2 ? null : "Ano inválido";
    }
    case "number":
      return Number.isFinite(Number(value)) && Number(value) >= 0 ? null : "Número inválido";
    case "digits":
      return /^\d+$/.test(value) ? null : "Use apenas números";
    case "select":
      return def.options && !def.options.some((o) => o.value === value) ? "Opção inválida" : null;
    default:
      return value.length > 2000 ? "Texto muito longo" : null;
  }
}

/** Formata um valor armazenado para exibição. */
export { formatValue } from "./display";
