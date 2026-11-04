export type RecordKind = "driver" | "vehicle";

export const RECORD_KINDS: RecordKind[] = ["driver", "vehicle"];

export function isRecordKind(v: unknown): v is RecordKind {
  return v === "driver" || v === "vehicle";
}

export const KIND_LABELS: Record<RecordKind, { singular: string; plural: string; slug: string; fichaTitle: string }> = {
  driver: { singular: "Motorista", plural: "Motoristas", slug: "motoristas", fichaTitle: "FICHA CADASTRAL DE MOTORISTA" },
  vehicle: { singular: "Veículo", plural: "Veículos", slug: "veiculos", fichaTitle: "FICHA CADASTRAL DE VEÍCULO" },
};

export function kindFromSlug(slug: string): RecordKind | null {
  if (slug === "motorista" || slug === "motoristas") return "driver";
  if (slug === "veiculo" || slug === "veiculos") return "vehicle";
  return null;
}

export type DocType =
  | "cnh"
  | "comprovante_residencia"
  | "dados_bancarios"
  | "crlv"
  | "antt"
  | "foto_veiculo"
  | "outro";

export const ALL_DOC_TYPES: DocType[] = [
  "cnh",
  "comprovante_residencia",
  "dados_bancarios",
  "crlv",
  "antt",
  "foto_veiculo",
  "outro",
];

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (ALL_DOC_TYPES as string[]).includes(v);
}

export interface DocTypeInfo {
  label: string;
  shortLabel: string;
  kind: RecordKind | "both";
  required: boolean;
  /** Permite mais de um arquivo (ex.: frente e verso, extratos). */
  multiple: boolean;
  /** Documento passa por extração automática. */
  extractable: boolean;
  hint: string;
  imagesOnly?: boolean;
}

export const DOC_TYPES: Record<DocType, DocTypeInfo> = {
  cnh: {
    label: "CNH — Carteira Nacional de Habilitação",
    shortLabel: "CNH",
    kind: "driver",
    required: true,
    multiple: true,
    extractable: true,
    hint: "PDF da CNH digital ou fotos legíveis (frente e verso).",
  },
  comprovante_residencia: {
    label: "Comprovante de residência",
    shortLabel: "Comprovante de residência",
    kind: "driver",
    required: true,
    multiple: true,
    extractable: true,
    hint: "Conta de consumo, fatura ou declaração recente.",
  },
  dados_bancarios: {
    label: "Dados bancários",
    shortLabel: "Dados bancários",
    kind: "driver",
    required: true,
    multiple: true,
    extractable: true,
    hint: "Cartão, comprovante de conta, print do app ou chave PIX.",
  },
  crlv: {
    label: "CRLV — Certificado de Registro e Licenciamento",
    shortLabel: "CRLV",
    kind: "vehicle",
    required: true,
    multiple: true,
    extractable: true,
    hint: "CRLV-e em PDF ou foto legível do documento.",
  },
  antt: {
    label: "ANTT — Registro RNTRC",
    shortLabel: "ANTT / RNTRC",
    kind: "vehicle",
    required: true,
    multiple: true,
    extractable: true,
    hint: "Certificado ou consulta do RNTRC do transportador.",
  },
  foto_veiculo: {
    label: "Foto do veículo",
    shortLabel: "Foto do veículo",
    kind: "vehicle",
    required: true,
    multiple: false,
    extractable: true,
    imagesOnly: true,
    hint: "Foto nítida mostrando o veículo inteiro.",
  },
  outro: {
    label: "Documentos adicionais",
    shortLabel: "Adicional",
    kind: "both",
    required: false,
    multiple: true,
    extractable: false,
    hint: "Opcional. Anexado ao final da ficha, sem extração automática.",
  },
};

/** Ordem dos documentos comprobatórios no PDF e na tela de upload. */
export const DOC_ORDER: Record<RecordKind, DocType[]> = {
  driver: ["cnh", "comprovante_residencia", "dados_bancarios", "outro"],
  vehicle: ["crlv", "antt", "foto_veiculo", "outro"],
};

export function requiredDocs(kind: RecordKind): DocType[] {
  return DOC_ORDER[kind].filter((d) => DOC_TYPES[d].required);
}

export function docTypeAllowedFor(kind: RecordKind, docType: DocType): boolean {
  const k = DOC_TYPES[docType].kind;
  return k === "both" || k === kind;
}

export const ACCEPTED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
export const ACCEPT_IMAGES_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";
