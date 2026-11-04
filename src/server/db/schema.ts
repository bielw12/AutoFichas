import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("user_role", ["admin", "operador", "visualizador"]);
export const recordKindEnum = pgEnum("record_kind", ["driver", "vehicle"]);
export const docTypeEnum = pgEnum("doc_type", [
  "cnh",
  "comprovante_residencia",
  "dados_bancarios",
  "crlv",
  "antt",
  "foto_veiculo",
  "outro",
]);
export const docStatusEnum = pgEnum("doc_processing_status", [
  "enviado",
  "processando",
  "processado",
  "ilegivel",
  "incompativel",
  "erro",
  "nao_aplicavel",
]);
export const baseStatusEnum = pgEnum("record_base_status", [
  "rascunho",
  "documentacao_pendente",
  "incompleto",
  "aguardando_conferencia",
  "completo",
]);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

// ------------------------------------------------------------------- Usuários

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    role: roleEnum().notNull().default("operador"),
    active: boolean().notNull().default(true),
    mustChangePassword: boolean().notNull().default(false),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 do token (o token em si fica apenas no cookie do usuário). */
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    success: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

// ------------------------------------------------------------- Configurações

export const companySettings = pgTable(
  "company_settings",
  {
    id: integer().primaryKey().default(1),
    companyName: text().notNull().default(""),
    cnpj: text().notNull().default(""),
    logoStorageKey: text(),
    logoMime: text(),
    primaryColor: text().notNull().default("#2D5A94"),
    accentColor: text().notNull().default("#F4CF14"),
    phones: text().notNull().default(""),
    emails: text().notNull().default(""),
    website: text().notNull().default(""),
    address: text().notNull().default(""),
    footerText: text().notNull().default(""),
    /** Aplica o rodapé institucional também às páginas dos documentos anexados. */
    footerOnDocuments: boolean().notNull().default(true),
    /** Inclui página "Dados bancários" na ficha do motorista. */
    includeBankPage: boolean().notNull().default(true),
    expiryWarningDays: integer().notNull().default(30),
    draftRetentionDays: integer().notNull().default(30),
    trashRetentionDays: integer().notNull().default(90),
    /** Permite enviar documentos a provedores externos de IA (LGPD). */
    externalAiEnabled: boolean().notNull().default(false),
    externalAiEnabledBy: uuid().references(() => users.id, { onDelete: "set null" }),
    externalAiEnabledAt: timestamp({ withTimezone: true }),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("company_settings_singleton", sql`${t.id} = 1`)],
);

// ------------------------------------------------------------- Cadastros base

const recordCommon = () => ({
  id: uuid().primaryKey().defaultRandom(),
  isDraft: boolean().notNull().default(true),
  baseStatus: baseStatusEnum().notNull().default("rascunho"),
  reviewPending: boolean().notNull().default(false),
  observacoes: text(),
  fieldMeta: jsonb().notNull().default({}),
  acknowledgedIssues: jsonb().$type<string[]>().notNull().default([]),
  pdfStorageKey: text(),
  pdfGeneratedAt: timestamp({ withTimezone: true }),
  pdfStale: boolean().notNull().default(true),
  currentVersion: integer().notNull().default(0),
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  archivedAt: timestamp({ withTimezone: true }),
  archivedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const drivers = pgTable(
  "drivers",
  {
    ...recordCommon(),
    // Pessoais
    nome: text(),
    cpf: text(),
    rg: text(),
    dataNascimento: date({ mode: "string" }),
    naturalidade: text(),
    // CNH
    cnhNumero: text(),
    cnhRegistro: text(),
    cnhCategoria: text(),
    cnhEmissao: date({ mode: "string" }),
    cnhValidade: date({ mode: "string" }),
    cnhPrimeiraHabilitacao: date({ mode: "string" }),
    cnhUf: text(),
    cnhObservacoes: text(),
    // Endereço
    cep: text(),
    logradouro: text(),
    numero: text(),
    complemento: text(),
    bairro: text(),
    cidade: text(),
    uf: text(),
    enderecoTitular: text(),
    enderecoVinculo: text(),
    comprovanteEmissao: date({ mode: "string" }),
    // Contato
    telefonePrincipal: text(),
    contatoComercialNome: text(),
    telefoneSecundario: text(),
    contatoOperacionalNome: text(),
    email: text(),
    contatoAdicional: text(),
    // Bancários
    bancoNome: text(),
    bancoCodigo: text(),
    agencia: text(),
    conta: text(),
    contaDigito: text(),
    contaTipo: text(),
    titularNome: text(),
    titularDocumento: text(),
    titularVinculo: text(),
    pixTipo: text(),
    pixChave: text(),
  },
  (t) => [
    uniqueIndex("drivers_cpf_active_unique").on(t.cpf).where(sql`${t.archivedAt} is null and ${t.isDraft} = false and ${t.cpf} is not null`),
    index("drivers_cpf_idx").on(t.cpf),
    index("drivers_updated_idx").on(t.updatedAt),
    index("drivers_validade_idx").on(t.cnhValidade),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    ...recordCommon(),
    marca: text(),
    modelo: text(),
    placa: text(),
    renavam: text(),
    chassi: text(),
    anoFabricacao: text(),
    anoModelo: text(),
    cor: text(),
    combustivel: text(),
    especieTipo: text(),
    crlvCategoria: text(),
    numeroCrv: text(),
    municipio: text(),
    ufRegistro: text(),
    capacidadeCargaKg: text(),
    cubagemM3: text(),
    tipoVeiculo: text(),
    tipoRodado: text(),
    tipoCarroceria: text(),
    eixos: text(),
    tagPedagioOperadora: text(),
    tagPedagioNumero: text(),
    caracteristicasVisuais: text(),
    rntrc: text(),
    anttTipo: text(),
    anttCategoria: text(),
    anttSituacao: text(),
    anttTransportadorNome: text(),
    anttTransportadorDocumento: text(),
    anttEmissao: date({ mode: "string" }),
    anttValidade: date({ mode: "string" }),
    crlvExercicio: text(),
    licenciamentoValidade: date({ mode: "string" }),
    proprietarioNome: text(),
    proprietarioDocumento: text(),
    proprietarioInfo: text(),
  },
  (t) => [
    uniqueIndex("vehicles_placa_active_unique").on(t.placa).where(sql`${t.archivedAt} is null and ${t.isDraft} = false and ${t.placa} is not null`),
    uniqueIndex("vehicles_renavam_active_unique").on(t.renavam).where(sql`${t.archivedAt} is null and ${t.isDraft} = false and ${t.renavam} is not null`),
    index("vehicles_placa_idx").on(t.placa),
    index("vehicles_updated_idx").on(t.updatedAt),
  ],
);

// ---------------------------------------------------------------- Documentos

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    recordKind: recordKindEnum().notNull(),
    driverId: uuid().references(() => drivers.id, { onDelete: "cascade" }),
    vehicleId: uuid().references(() => vehicles.id, { onDelete: "cascade" }),
    docType: docTypeEnum().notNull(),
    originalName: text().notNull(),
    storageKey: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    pageCount: integer(),
    position: integer().notNull().default(0),
    processingStatus: docStatusEnum().notNull().default("enviado"),
    processingMessage: text(),
    uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Documento substituído/removido: mantido no histórico até o expurgo. */
    supersededAt: timestamp({ withTimezone: true }),
    supersededBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    check(
      "documents_owner_check",
      sql`(${t.recordKind} = 'driver' and ${t.driverId} is not null and ${t.vehicleId} is null) or (${t.recordKind} = 'vehicle' and ${t.vehicleId} is not null and ${t.driverId} is null)`,
    ),
    index("documents_driver_idx").on(t.driverId),
    index("documents_vehicle_idx").on(t.vehicleId),
  ],
);

export const extractionResults = pgTable(
  "extraction_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    recordKind: recordKindEnum().notNull(),
    driverId: uuid().references(() => drivers.id, { onDelete: "cascade" }),
    vehicleId: uuid().references(() => vehicles.id, { onDelete: "cascade" }),
    docType: docTypeEnum().notNull(),
    /** Documento principal de origem (o primeiro arquivo do grupo). */
    documentId: uuid().references(() => documents.id, { onDelete: "cascade" }),
    documentIds: jsonb().$type<string[]>().notNull().default([]),
    provider: text().notNull(),
    model: text(),
    detectedType: text(),
    matchesExpected: boolean().notNull().default(true),
    legibility: text().notNull().default("boa"),
    /** Campos normalizados com confiança e status. */
    fields: jsonb().notNull().default({}),
    warnings: jsonb().$type<string[]>().notNull().default([]),
    missingFields: jsonb().$type<string[]>().notNull().default([]),
    error: text(),
    durationMs: integer(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("extraction_driver_idx").on(t.driverId), index("extraction_vehicle_idx").on(t.vehicleId)],
);

// ------------------------------------------------------- Versões e auditoria

export const recordVersions = pgTable(
  "record_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    recordKind: recordKindEnum().notNull(),
    driverId: uuid().references(() => drivers.id, { onDelete: "cascade" }),
    vehicleId: uuid().references(() => vehicles.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    /** Snapshot completo dos dados da ficha nesta versão. */
    data: jsonb().notNull(),
    changedFields: jsonb().$type<string[]>().notNull().default([]),
    documentChanges: jsonb().$type<{ action: string; docType: string; name: string }[]>().notNull().default([]),
    reason: text(),
    pdfStorageKey: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("versions_driver_unique").on(t.driverId, t.version).where(sql`${t.driverId} is not null`),
    uniqueIndex("versions_vehicle_unique").on(t.vehicleId, t.version).where(sql`${t.vehicleId} is not null`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    userName: text(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    /** Detalhes SEM dados pessoais (apenas nomes de campos, tipos, contagens). */
    details: jsonb().notNull().default({}),
    ip: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type DriverRow = typeof drivers.$inferSelect;
export type VehicleRow = typeof vehicles.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type ExtractionRow = typeof extractionResults.$inferSelect;
export type VersionRow = typeof recordVersions.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
