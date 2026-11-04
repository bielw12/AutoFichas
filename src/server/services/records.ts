import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { DOC_ORDER, type DocType, type RecordKind } from "@/lib/doc-types";
import type { ExtractionSummary } from "@/lib/extraction-types";
import type { FieldMetaMap } from "@/lib/field-meta";
import { DUPLICATE_KEYS, FIELDS, fieldKeys, recordTitle, type FormValues } from "@/lib/fields";
import { normalizeInput, validateInput } from "@/lib/normalize";
import { computeBaseStatus, effectiveStatus, expiryInfo, isRecordStatus, type BaseStatus, type RecordStatus } from "@/lib/status";
import { addDaysISO, onlyDigits, todayISO } from "@/lib/validators";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { documents, drivers, extractionResults, recordVersions, vehicles, type DocumentRow, type DriverRow, type VehicleRow } from "../db/schema";
import { storage } from "../storage";
import { getSettings } from "./settings";

export type AnyRecordRow = DriverRow | VehicleRow;
type AnyTable = typeof drivers | typeof vehicles;

export function tableFor(kind: RecordKind): AnyTable {
  return kind === "driver" ? drivers : vehicles;
}

function col(kind: RecordKind, key: string): PgColumn {
  const c = (tableFor(kind) as unknown as Record<string, PgColumn>)[key];
  if (!c) throw new Error(`Coluna desconhecida: ${key}`);
  return c;
}

export function ownerCols(kind: RecordKind) {
  return {
    doc: kind === "driver" ? documents.driverId : documents.vehicleId,
    ext: kind === "driver" ? extractionResults.driverId : extractionResults.vehicleId,
    ver: kind === "driver" ? recordVersions.driverId : recordVersions.vehicleId,
    ownerField: kind === "driver" ? ("driverId" as const) : ("vehicleId" as const),
  };
}

export class DomainError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "duplicate" | "invalid" | "conflict" = "invalid",
    public extra?: unknown,
  ) {
    super(message);
  }
}

// ------------------------------------------------------- Conversões de dados

export function rowToValues(kind: RecordKind, row: AnyRecordRow): FormValues {
  const r = row as unknown as Record<string, unknown>;
  return Object.fromEntries(fieldKeys(kind).map((k) => [k, r[k] === null || r[k] === undefined ? "" : String(r[k])]));
}

/** Normaliza e valida valores vindos do formulário. Lança DomainError com os erros. */
export function valuesToColumns(kind: RecordKind, input: Partial<FormValues>, opts: { partial?: boolean } = {}) {
  const out: Record<string, string | null> = {};
  const errors: Record<string, string> = {};
  for (const def of FIELDS[kind]) {
    if (!(def.key in input)) {
      if (!opts.partial) out[def.key] = null;
      continue;
    }
    const raw = input[def.key];
    if (typeof raw !== "string" && raw !== undefined && raw !== null) {
      errors[def.key] = "Valor inválido";
      continue;
    }
    const v = normalizeInput(def.input, (raw ?? "").slice(0, def.input === "textarea" ? 4000 : 300));
    const err = validateInput(def, v);
    if (err) errors[def.key] = err;
    out[def.key] = v === "" ? null : v;
  }
  if (Object.keys(errors).length) throw new DomainError("Há campos com formato inválido.", "invalid", errors);
  return out;
}

// --------------------------------------------------------------- Consultas

export async function getRecord(kind: RecordKind, id: string, opts: { includeArchived?: boolean } = {}): Promise<AnyRecordRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const t = tableFor(kind);
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.id, id), opts.includeArchived ? undefined : isNull(t.archivedAt)))
    .limit(1);
  return (rows[0] as AnyRecordRow) ?? null;
}

export async function requireRecord(kind: RecordKind, id: string, opts: { includeArchived?: boolean } = {}) {
  const r = await getRecord(kind, id, opts);
  if (!r) throw new DomainError("Cadastro não encontrado.", "not_found");
  return r;
}

export async function listCurrentDocuments(kind: RecordKind, id: string): Promise<DocumentRow[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(ownerCols(kind).doc, id), isNull(documents.supersededAt)))
    .orderBy(asc(documents.position), asc(documents.uploadedAt));
  const order = DOC_ORDER[kind];
  return rows.sort((a, b) => order.indexOf(a.docType) - order.indexOf(b.docType) || a.position - b.position || a.uploadedAt.getTime() - b.uploadedAt.getTime());
}

export async function listAllDocuments(kind: RecordKind, id: string): Promise<DocumentRow[]> {
  return db.select().from(documents).where(eq(ownerCols(kind).doc, id)).orderBy(desc(documents.uploadedAt));
}

export function toExtractionSummary(r: typeof extractionResults.$inferSelect): ExtractionSummary {
  return {
    id: r.id,
    docType: r.docType,
    documentIds: r.documentIds,
    provider: r.provider,
    model: r.model,
    detectedType: r.detectedType,
    matchesExpected: r.matchesExpected,
    legibility: r.legibility as ExtractionSummary["legibility"],
    fields: r.fields as ExtractionSummary["fields"],
    warnings: r.warnings,
    missingFields: r.missingFields,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Último resultado de extração por tipo de documento. */
export async function getLatestExtractions(kind: RecordKind, id: string): Promise<ExtractionSummary[]> {
  const rows = await db.select().from(extractionResults).where(eq(ownerCols(kind).ext, id)).orderBy(desc(extractionResults.createdAt));
  const seen = new Set<string>();
  const out: ExtractionSummary[] = [];
  for (const r of rows) {
    if (seen.has(r.docType)) continue;
    seen.add(r.docType);
    out.push(toExtractionSummary(r));
  }
  return out;
}

/** Tipos de documento cujos arquivos atuais ainda não foram processados. */
export function pendingDocTypes(docs: DocumentRow[], extractions: ExtractionSummary[]): DocType[] {
  const byType = new Map<DocType, string[]>();
  for (const d of docs) {
    if (d.docType === "outro") continue;
    byType.set(d.docType, [...(byType.get(d.docType) ?? []), d.id]);
  }
  const out: DocType[] = [];
  for (const [t, ids] of byType) {
    const ex = extractions.find((e) => e.docType === t && !e.error);
    const same = ex && ex.documentIds.length === ids.length && ids.every((i) => ex.documentIds.includes(i));
    if (!same) out.push(t);
  }
  return out;
}

export async function findDuplicates(kind: RecordKind, values: Partial<FormValues>, excludeId?: string) {
  const t = tableFor(kind);
  const found: { id: string; title: string; field: string; label: string }[] = [];
  for (const { key, label } of DUPLICATE_KEYS[kind]) {
    const def = FIELDS[kind].find((f) => f.key === key)!;
    const v = normalizeInput(def.input, values[key] ?? "");
    if (!v) continue;
    const rows = await db
      .select()
      .from(t)
      .where(and(eq(col(kind, key), v), eq(t.isDraft, false), isNull(t.archivedAt), excludeId ? ne(t.id, excludeId) : undefined))
      .limit(5);
    for (const r of rows as AnyRecordRow[]) {
      if (!found.some((f) => f.id === r.id)) found.push({ id: r.id, title: recordTitle(kind, rowToValues(kind, r)), field: key, label });
    }
  }
  return found;
}

// ----------------------------------------------------------------- Status

export async function recomputeStatus(kind: RecordKind, id: string): Promise<BaseStatus> {
  const row = await requireRecord(kind, id, { includeArchived: true });
  const docs = await listCurrentDocuments(kind, id);
  const base = computeBaseStatus({
    kind,
    values: rowToValues(kind, row),
    presentDocs: Array.from(new Set(docs.map((d) => d.docType))),
    reviewPending: row.reviewPending,
    isDraft: row.isDraft,
  });
  const t = tableFor(kind);
  await db.update(t).set({ baseStatus: base }).where(eq(t.id, id));
  return base;
}

export async function recordStatusInfo(kind: RecordKind, row: AnyRecordRow) {
  const settings = await getSettings();
  const values = rowToValues(kind, row);
  const expiries = expiryInfo(kind, values, settings.expiryWarningDays);
  return { status: effectiveStatus(row.baseStatus, expiries), expiries };
}

// -------------------------------------------------------------- Mutations

export async function createDraft(kind: RecordKind, user: SessionUser): Promise<string> {
  const t = tableFor(kind);
  const [row] = await db.insert(t).values({ createdBy: user.id, updatedBy: user.id }).returning({ id: t.id });
  await audit({ user, action: "record.draft_created", entityType: kind, entityId: row.id });
  return row.id;
}

/** Salva dados do rascunho (wizard) sem gerar versão. */
export async function saveDraftData(kind: RecordKind, id: string, values: Partial<FormValues>, meta: FieldMetaMap, acknowledged: string[], user: SessionUser) {
  const row = await requireRecord(kind, id);
  if (!row.isDraft) throw new DomainError("Este cadastro já foi finalizado. Use a edição da ficha.", "conflict");
  const cols = valuesToColumns(kind, values, { partial: true });
  const t = tableFor(kind);
  await db
    .update(t)
    .set({ ...cols, fieldMeta: meta, acknowledgedIssues: acknowledged.slice(0, 200), updatedBy: user.id, updatedAt: new Date(), pdfStale: true } as never)
    .where(eq(t.id, id));
}

function snapshotDocs(docs: DocumentRow[]) {
  return docs.map((d) => ({ id: d.id, docType: d.docType, name: d.originalName, uploadedAt: d.uploadedAt.toISOString() }));
}

async function insertVersion(
  kind: RecordKind,
  id: string,
  version: number,
  data: Record<string, unknown>,
  changedFields: string[],
  documentChanges: { action: string; docType: string; name: string }[],
  reason: string,
  user: SessionUser,
) {
  const own = ownerCols(kind);
  await db.insert(recordVersions).values({
    recordKind: kind,
    [own.ownerField]: id,
    version,
    data,
    changedFields,
    documentChanges,
    reason,
    createdBy: user.id,
  });
}

export async function finalizeRecord(
  kind: RecordKind,
  id: string,
  values: FormValues,
  meta: FieldMetaMap,
  acknowledged: string[],
  user: SessionUser,
  opts: { allowMissingDocs: boolean },
) {
  const row = await requireRecord(kind, id);
  if (!row.isDraft) throw new DomainError("Este cadastro já foi salvo.", "conflict");
  const cols = valuesToColumns(kind, values);
  const dups = await findDuplicates(kind, cols as FormValues, id);
  if (dups.length) throw new DomainError("Já existe um cadastro com o mesmo identificador.", "duplicate", dups);

  const docs = await listCurrentDocuments(kind, id);
  const present = Array.from(new Set(docs.map((d) => d.docType)));
  const base = computeBaseStatus({ kind, values: values, presentDocs: present, reviewPending: false, isDraft: false });
  if (base === "documentacao_pendente" && !opts.allowMissingDocs) {
    throw new DomainError("Envie todos os documentos obrigatórios antes de salvar a ficha.", "invalid");
  }

  const t = tableFor(kind);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(t)
        .set({
          ...cols,
          fieldMeta: meta,
          acknowledgedIssues: acknowledged,
          isDraft: false,
          reviewPending: false,
          baseStatus: base,
          currentVersion: 1,
          updatedBy: user.id,
          updatedAt: new Date(),
        } as never)
        .where(eq(t.id, id));
    });
  } catch (err) {
    if (/unique/i.test((err as Error).message)) throw new DomainError("Já existe um cadastro com o mesmo identificador.", "duplicate", await findDuplicates(kind, cols as FormValues, id));
    throw err;
  }
  await insertVersion(
    kind,
    id,
    1,
    { values: cols, documents: snapshotDocs(docs) },
    Object.keys(cols).filter((k) => cols[k] !== null),
    docs.map((d) => ({ action: "adicionado", docType: d.docType, name: d.originalName })),
    "Cadastro inicial",
    user,
  );
  await audit({ user, action: "record.finalized", entityType: kind, entityId: id, details: { status: base, documentos: docs.length } });
  return base;
}

/**
 * Atualiza apenas os campos informados, preservando os demais. Cria nova
 * versão com a lista de campos modificados.
 */
export async function updateRecord(
  kind: RecordKind,
  id: string,
  changes: Partial<FormValues>,
  user: SessionUser,
  opts: { meta?: FieldMetaMap; acknowledged?: string[]; reason?: string; reviewPending?: boolean; documentChanges?: { action: string; docType: string; name: string }[] } = {},
) {
  const row = await requireRecord(kind, id);
  if (row.isDraft) throw new DomainError("Finalize o cadastro antes de editá-lo.", "conflict");
  const before = rowToValues(kind, row);
  const cols = valuesToColumns(kind, changes, { partial: true });
  const changed = Object.keys(cols).filter((k) => (cols[k] ?? "") !== (before[k] ?? ""));
  const docChanges = opts.documentChanges ?? [];

  const merged = { ...before, ...Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v ?? ""])) };
  if (changed.some((k) => DUPLICATE_KEYS[kind].some((d) => d.key === k))) {
    const dups = await findDuplicates(kind, merged, id);
    if (dups.length) throw new DomainError("Já existe um cadastro com o mesmo identificador.", "duplicate", dups);
  }

  const metaChanged = opts.meta !== undefined || opts.acknowledged !== undefined || opts.reviewPending !== undefined;
  if (!changed.length && !docChanges.length && !metaChanged) return { changed: [], version: row.currentVersion };

  const nextMeta = { ...(row.fieldMeta as FieldMetaMap), ...(opts.meta ?? {}) };
  const t = tableFor(kind);
  const newVersion = changed.length || docChanges.length ? row.currentVersion + 1 : row.currentVersion;
  try {
    await db
      .update(t)
      .set({
        ...cols,
        fieldMeta: nextMeta,
        ...(opts.acknowledged ? { acknowledgedIssues: opts.acknowledged } : {}),
        ...(opts.reviewPending !== undefined ? { reviewPending: opts.reviewPending } : {}),
        ...(newVersion !== row.currentVersion ? { pdfStale: true, currentVersion: newVersion } : {}),
        updatedBy: user.id,
        updatedAt: new Date(),
      } as never)
      .where(eq(t.id, id));
  } catch (err) {
    if (/unique/i.test((err as Error).message)) throw new DomainError("Já existe um cadastro com o mesmo identificador.", "duplicate");
    throw err;
  }

  if (newVersion !== row.currentVersion) {
    const docs = await listCurrentDocuments(kind, id);
    const allCols = valuesToColumns(kind, merged);
    await insertVersion(kind, id, newVersion, { values: allCols, documents: snapshotDocs(docs) }, changed, docChanges, opts.reason ?? "Edição", user);
    await audit({ user, action: "record.updated", entityType: kind, entityId: id, details: { campos: changed, documentos: docChanges.map((d) => `${d.action}:${d.docType}`), versao: newVersion } });
  }
  await recomputeStatus(kind, id);
  return { changed, version: newVersion };
}

/** Registra mudança de documento (substituição/remoção) como nova versão. */
export async function registerDocumentChange(kind: RecordKind, id: string, change: { action: string; docType: string; name: string }, user: SessionUser) {
  const row = await requireRecord(kind, id);
  const t = tableFor(kind);
  if (row.isDraft) {
    await db.update(t).set({ pdfStale: true, updatedAt: new Date(), updatedBy: user.id }).where(eq(t.id, id));
    return;
  }
  await updateRecord(kind, id, {}, user, { documentChanges: [change], reason: `Documento ${change.action}` });
}

export async function archiveRecord(kind: RecordKind, id: string, user: SessionUser) {
  const t = tableFor(kind);
  const row = await requireRecord(kind, id);
  await db.update(t).set({ archivedAt: new Date(), archivedBy: user.id }).where(eq(t.id, id));
  await audit({ user, action: "record.archived", entityType: kind, entityId: id, details: { rascunho: row.isDraft } });
}

export async function restoreRecord(kind: RecordKind, id: string, user: SessionUser) {
  const t = tableFor(kind);
  const row = await requireRecord(kind, id, { includeArchived: true });
  if (!row.archivedAt) return;
  if (!row.isDraft) {
    const dups = await findDuplicates(kind, rowToValues(kind, row), id);
    if (dups.length) throw new DomainError("Não é possível restaurar: já existe cadastro ativo com o mesmo identificador.", "duplicate", dups);
  }
  await db.update(t).set({ archivedAt: null, archivedBy: null }).where(eq(t.id, id));
  await audit({ user, action: "record.restored", entityType: kind, entityId: id });
}

/** Exclusão definitiva: remove arquivos do storage e o registro (cascata no banco). */
export async function purgeRecord(kind: RecordKind, id: string, user: SessionUser | null) {
  const row = await requireRecord(kind, id, { includeArchived: true });
  const own = ownerCols(kind);
  const docs = await db.select({ key: documents.storageKey }).from(documents).where(eq(own.doc, id));
  const versions = await db.select({ key: recordVersions.pdfStorageKey }).from(recordVersions).where(and(eq(own.ver, id), isNotNull(recordVersions.pdfStorageKey)));
  const keys = Array.from(new Set([...docs.map((d) => d.key), ...versions.map((v) => v.key!), row.pdfStorageKey].filter(Boolean) as string[]));
  await storage().delete(keys);
  const t = tableFor(kind);
  await db.delete(t).where(eq(t.id, id));
  await audit({ user, action: "record.purged", entityType: kind, entityId: id, details: { arquivos: keys.length, rascunho: row.isDraft } });
  return keys.length;
}

// --------------------------------------------------------------- Listagem

export type SortKey = "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "name_asc";

export interface ListParams {
  q?: string;
  status?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  archived?: boolean;
  drafts?: boolean;
}

function expiryExpr(kind: RecordKind): SQL {
  return kind === "driver" ? sql`${drivers.cnhValidade}` : sql`least(${vehicles.anttValidade}, ${vehicles.licenciamentoValidade})`;
}

export function effectiveStatusSql(kind: RecordKind, warningDays: number, today = todayISO()): SQL<string> {
  const t = tableFor(kind);
  const exp = expiryExpr(kind);
  const limit = addDaysISO(today, warningDays);
  return sql<string>`case
    when ${t.isDraft} then 'rascunho'
    when ${exp} < ${today}::date then 'vencido'
    when ${t.baseStatus} <> 'completo' then ${t.baseStatus}::text
    when ${exp} <= ${limit}::date then 'proximo_vencimento'
    else 'completo' end`;
}

function searchCondition(kind: RecordKind, q: string): SQL | undefined {
  const term = q.trim().slice(0, 100);
  if (!term) return undefined;
  const like = `%${term.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  const digits = onlyDigits(term);
  const compact = term.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (kind === "driver") {
    return or(
      ilike(drivers.nome, like),
      ilike(drivers.cidade, like),
      digits.length >= 3 ? ilike(drivers.cpf, `%${digits}%`) : undefined,
      digits.length >= 3 ? ilike(drivers.cnhRegistro, `%${digits}%`) : undefined,
      digits.length >= 3 ? ilike(drivers.cnhNumero, `%${digits}%`) : undefined,
      digits.length >= 4 ? ilike(drivers.telefonePrincipal, `%${digits}%`) : undefined,
    );
  }
  return or(
    ilike(vehicles.modelo, like),
    ilike(vehicles.marca, like),
    ilike(vehicles.proprietarioNome, like),
    compact.length >= 3 ? ilike(vehicles.placa, `%${compact}%`) : undefined,
    compact.length >= 3 ? ilike(vehicles.chassi, `%${compact}%`) : undefined,
    digits.length >= 3 ? ilike(vehicles.renavam, `%${digits}%`) : undefined,
    digits.length >= 3 ? ilike(vehicles.rntrc, `%${digits}%`) : undefined,
  );
}

export async function listRecords(kind: RecordKind, params: ListParams) {
  const settings = await getSettings();
  const t = tableFor(kind);
  const statusExpr = effectiveStatusSql(kind, settings.expiryWarningDays);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 5), 200);
  const page = Math.max(params.page ?? 1, 1);

  const where = and(
    params.archived ? isNotNull(t.archivedAt) : isNull(t.archivedAt),
    params.drafts ? eq(t.isDraft, true) : params.archived ? undefined : eq(t.isDraft, false),
    params.q ? searchCondition(kind, params.q) : undefined,
    params.status && isRecordStatus(params.status) ? sql`(${statusExpr}) = ${params.status}` : undefined,
  );

  const nameCol = kind === "driver" ? drivers.nome : vehicles.modelo;
  const order =
    params.sort === "updated_asc"
      ? [asc(t.updatedAt)]
      : params.sort === "created_desc"
        ? [desc(t.createdAt)]
        : params.sort === "created_asc"
          ? [asc(t.createdAt)]
          : params.sort === "name_asc"
            ? [asc(nameCol), desc(t.updatedAt)]
            : [desc(t.updatedAt)];

  const rows = await db
    .select({ row: t, status: statusExpr })
    .from(t)
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t).where(where);

  return {
    items: rows.map((r) => {
      const row = r.row as AnyRecordRow;
      const values = rowToValues(kind, row);
      return { row, values, status: r.status as RecordStatus, expiries: expiryInfo(kind, values, settings.expiryWarningDays) };
    }),
    total: count,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(count / pageSize)),
  };
}

export async function getVersions(kind: RecordKind, id: string) {
  return db.select().from(recordVersions).where(eq(ownerCols(kind).ver, id)).orderBy(desc(recordVersions.version), desc(recordVersions.createdAt));
}

export async function documentsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(documents).where(inArray(documents.id, ids));
}

export { effectiveStatus, expiryInfo };
