import { DOC_TYPES, requiredDocs, type DocType, type RecordKind, type RequirementOptions } from "./doc-types";
import { EXPIRY_FIELDS, FIELDS, type FormValues } from "./fields";
import { addDaysISO, diffDaysISO, todayISO } from "./validators";

/** Situação persistida (não depende da data atual). */
export type BaseStatus = "rascunho" | "documentacao_pendente" | "incompleto" | "aguardando_conferencia" | "completo";

/** Situação efetiva exibida ao usuário. */
export type RecordStatus = BaseStatus | "vencido" | "proximo_vencimento";

export const STATUS_INFO: Record<RecordStatus, { label: string; tone: "green" | "yellow" | "red" | "blue" | "slate" | "orange"; description: string }> = {
  completo: { label: "Completo", tone: "green", description: "Documentação e dados obrigatórios presentes." },
  incompleto: { label: "Incompleto", tone: "orange", description: "Há campos obrigatórios sem preenchimento." },
  aguardando_conferencia: { label: "Aguardando conferência", tone: "blue", description: "Há sugestões da IA ainda não conferidas." },
  documentacao_pendente: { label: "Documentação pendente", tone: "orange", description: "Falta pelo menos um documento obrigatório." },
  proximo_vencimento: { label: "Próximo do vencimento", tone: "yellow", description: "Documento com validade próxima." },
  vencido: { label: "Documento vencido", tone: "red", description: "Documento com validade expirada." },
  rascunho: { label: "Rascunho", tone: "slate", description: "Cadastro em andamento." },
};

export const STATUS_FILTERS: RecordStatus[] = [
  "completo",
  "incompleto",
  "aguardando_conferencia",
  "documentacao_pendente",
  "proximo_vencimento",
  "vencido",
];

export function isRecordStatus(v: unknown): v is RecordStatus {
  return typeof v === "string" && v in STATUS_INFO;
}

export interface ExpiryInfo {
  key: string;
  label: string;
  date: string;
  daysLeft: number;
  state: "vencido" | "proximo" | "ok";
}

export function expiryInfo(kind: RecordKind, v: Partial<FormValues>, warningDays: number, today = todayISO()): ExpiryInfo[] {
  const out: ExpiryInfo[] = [];
  for (const f of EXPIRY_FIELDS[kind]) {
    const date = v[f.key];
    // Sem data → não presume validade nem vencimento.
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const daysLeft = diffDaysISO(date, today);
    const state = date < today ? "vencido" : date <= addDaysISO(today, warningDays) ? "proximo" : "ok";
    out.push({ key: f.key, label: f.label, date, daysLeft, state });
  }
  return out;
}

export function missingRequiredFields(kind: RecordKind, v: Partial<FormValues>, opts: RequirementOptions = {}): string[] {
  const missing = FIELDS[kind].filter((f) => f.required && !(v[f.key] ?? "").toString().trim()).map((f) => f.key);
  // Com os dados bancários padrão da transportadora, os do motorista são opcionais
  if (kind === "driver" && !opts.companyBank) {
    // Dados bancários: exige banco + titular + (conta ou chave PIX)
    const hasAccount = !!(v.conta || v.pixChave);
    if (!v.bancoNome && !v.pixChave) missing.push("bancoNome");
    if (!hasAccount) missing.push("conta");
    if (!v.titularNome) missing.push("titularNome");
  }
  return Array.from(new Set(missing));
}

export function missingDocs(kind: RecordKind, present: DocType[], opts: RequirementOptions = {}): DocType[] {
  return requiredDocs(kind, opts).filter((d) => !present.includes(d));
}

export function computeBaseStatus(args: {
  kind: RecordKind;
  values: Partial<FormValues>;
  presentDocs: DocType[];
  reviewPending: boolean;
  isDraft: boolean;
  companyBank?: boolean;
}): BaseStatus {
  const opts = { companyBank: args.companyBank };
  if (args.isDraft) return "rascunho";
  if (missingDocs(args.kind, args.presentDocs, opts).length) return "documentacao_pendente";
  if (missingRequiredFields(args.kind, args.values, opts).length) return "incompleto";
  if (args.reviewPending) return "aguardando_conferencia";
  return "completo";
}

export function effectiveStatus(base: BaseStatus, expiries: ExpiryInfo[]): RecordStatus {
  if (base === "rascunho") return base;
  if (expiries.some((e) => e.state === "vencido")) return "vencido";
  if (base !== "completo") return base;
  if (expiries.some((e) => e.state === "proximo")) return "proximo_vencimento";
  return "completo";
}

export function describeMissingDocs(list: DocType[]): string {
  return list.map((d) => DOC_TYPES[d].shortLabel).join(", ");
}
