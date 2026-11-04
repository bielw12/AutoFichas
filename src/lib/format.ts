import { onlyDigits } from "./validators";

export function formatCPF(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 11) return v ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCNPJ(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCpfCnpj(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length === 11) return formatCPF(d);
  if (d.length === 14) return formatCNPJ(d);
  return v ?? "";
}

export function formatCEP(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 8) return v ?? "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function formatPhone(v: string | null | undefined): string {
  let d = onlyDigits(v);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

export function formatPlaca(v: string | null | undefined): string {
  const p = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{3}\d{4}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3)}`;
  return p;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatDateTimeBR(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export function formatNumberBR(v: string | number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// --------------------------------------------------------------- Máscaras ----

/** CPF mascarado para listagens: ***.456.789-** */
export function maskCPF(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 11) return d ? "•••" : "";
  return `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
}

export function maskCpfCnpj(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length === 11) return maskCPF(d);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.•••/••••-${d.slice(12)}`;
  return d ? "•••" : "";
}

/** Mantém apenas os últimos `visible` caracteres. */
export function maskTail(v: string | null | undefined, visible = 2): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (s.length <= visible) return "•".repeat(s.length);
  return "•".repeat(Math.min(6, s.length - visible)) + s.slice(-visible);
}

export function maskEmail(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const [user, domain] = s.split("@");
  if (!domain) return maskTail(s, 3);
  return `${user.slice(0, 2)}•••@${domain}`;
}

export function maskPix(v: string | null | undefined, tipo?: string | null): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (tipo === "email" || s.includes("@")) return maskEmail(s);
  if (tipo === "cpf" || tipo === "cnpj") return maskCpfCnpj(s);
  return maskTail(s, 4);
}
