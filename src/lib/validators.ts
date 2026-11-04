/**
 * Validações de FORMATO. Nenhuma destas funções confirma a autenticidade de um
 * documento junto a órgãos oficiais — apenas verificam estrutura e dígitos.
 */

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE", "ACC"] as const;

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

export function isValidCPF(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCNPJ(value: string | null | undefined): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function isValidCpfCnpj(v: string | null | undefined): boolean {
  const d = onlyDigits(v);
  return d.length === 11 ? isValidCPF(d) : d.length === 14 ? isValidCNPJ(d) : false;
}

export function isValidCEP(v: string | null | undefined): boolean {
  const d = onlyDigits(v);
  return d.length === 8 && !/^0{8}$/.test(d);
}

export function isValidPhone(v: string | null | undefined): boolean {
  let d = onlyDigits(v);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

export function isValidUF(v: string | null | undefined): boolean {
  return !!v && (UFS as readonly string[]).includes(v.toUpperCase());
}

export function isValidEmail(v: string | null | undefined): boolean {
  return !!v && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

// ---------------------------------------------------------------- Placas ----

const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B" };
const TO_DIGIT: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", A: "4", S: "5", G: "6", T: "7", B: "8" };

export function isValidPlaca(v: string | null | undefined): boolean {
  const p = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
}

/**
 * Normaliza a placa corrigindo confusões de OCR **somente quando a posição do
 * caractere não deixa dúvida** (3 letras, 1 dígito, letra/dígito, 2 dígitos).
 */
export function normalizePlaca(v: string | null | undefined): { value: string; adjusted: boolean } {
  const raw = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 7) return { value: raw, adjusted: false };
  const chars = raw.split("");
  let adjusted = false;
  for (let i = 0; i < 7; i++) {
    const c = chars[i];
    if (i < 3 && /\d/.test(c) && TO_LETTER[c]) {
      chars[i] = TO_LETTER[c];
      adjusted = true;
    } else if ((i === 3 || i >= 5) && /[A-Z]/.test(c) && TO_DIGIT[c]) {
      chars[i] = TO_DIGIT[c];
      adjusted = true;
    }
  }
  return { value: chars.join(""), adjusted };
}

export function isValidRenavam(v: string | null | undefined): boolean {
  let d = onlyDigits(v);
  if (d.length < 9 || d.length > 11) return false;
  d = d.padStart(11, "0");
  if (/^0+$/.test(d)) return false;
  const body = d.slice(0, 10).split("").reverse();
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const sum = body.reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
  let dv = (sum * 10) % 11;
  if (dv === 10) dv = 0;
  return dv === Number(d[10]);
}

export function isValidChassi(v: string | null | undefined): boolean {
  const c = (v ?? "").toUpperCase().replace(/\s+/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(c);
}

/** Registro da CNH: 11 dígitos com dois dígitos verificadores. */
export function isValidCnhRegistro(v: string | null | undefined): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0, j = 9; i < 9; i++, j--) sum += Number(d[i]) * j;
  let dv1 = sum % 11;
  let dsc = 0;
  if (dv1 >= 10) {
    dv1 = 0;
    dsc = 2;
  }
  sum = 0;
  for (let i = 0, j = 1; i < 9; i++, j++) sum += Number(d[i]) * j;
  const x = sum % 11;
  let dv2 = x >= 10 ? 0 : x - dsc;
  if (dv2 < 0) dv2 += 11;
  if (dv2 >= 10) dv2 = 0;
  return `${dv1}${dv2}` === d.slice(9);
}

// ----------------------------------------------------------------- Datas ----

export function isValidISODate(v: string | null | undefined): boolean {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2100;
}

/**
 * Converte datas em formatos comuns (dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd)
 * para ISO (aaaa-mm-dd). Retorna null quando não for possível sem ambiguidade.
 */
export function parseDateToISO(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    return isValidISODate(iso) ? iso : null;
  }
  return null;
}

export function todayISO(now: Date = new Date()): string {
  // Data local no fuso de Brasília para cálculos de vencimento
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDaysISO(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
}

// ---------------------------------------------------------- Comparações ----

export function normalizeName(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\b(DE|DA|DO|DAS|DOS|E)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similaridade simples entre nomes (proporção de tokens em comum). */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}
