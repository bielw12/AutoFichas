"use server";

import { revalidatePath } from "next/cache";
import { isRecordKind, KIND_LABELS, type RecordKind } from "@/lib/doc-types";
import type { FieldMetaMap } from "@/lib/field-meta";
import { FIELDS, type FormValues } from "@/lib/fields";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/http";
import { removeDocument } from "@/server/services/documents";
import { generateFicha } from "@/server/services/ficha";
import {
  archiveRecord,
  createDraft,
  DomainError,
  finalizeRecord,
  findDuplicates,
  purgeRecord,
  requireRecord,
  restoreRecord,
  rowToValues,
  saveDraftData,
  updateRecord,
} from "@/server/services/records";
import { recordEditorState } from "@/server/views";

function assertKind(kind: unknown): RecordKind {
  if (!isRecordKind(kind)) throw new DomainError("Tipo de cadastro inválido.");
  return kind;
}

function sanitizeValues(kind: RecordKind, input: unknown): FormValues {
  const out: FormValues = {};
  if (!input || typeof input !== "object") return out;
  for (const f of FIELDS[kind]) {
    const v = (input as Record<string, unknown>)[f.key];
    if (typeof v === "string") out[f.key] = v;
  }
  return out;
}

function sanitizeMeta(kind: RecordKind, input: unknown): FieldMetaMap {
  const out: FieldMetaMap = {};
  if (!input || typeof input !== "object") return out;
  const keys = new Set(FIELDS[kind].map((f) => f.key));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!keys.has(k) || !v || typeof v !== "object") continue;
    const m = v as FieldMetaMap[string];
    if (!["high", "review", "missing", "conflict", "manual", "confirmed"].includes(m.status)) continue;
    out[k] = {
      status: m.status,
      confidence: typeof m.confidence === "number" ? m.confidence : undefined,
      source: m.source && typeof m.source === "object" ? m.source : undefined,
      notes: Array.isArray(m.notes) ? m.notes.filter((n) => typeof n === "string").slice(0, 5).map((n) => n.slice(0, 300)) : undefined,
      suggested: typeof m.suggested === "string" ? m.suggested.slice(0, 500) : null,
      updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : undefined,
    };
  }
  return out;
}

function sanitizeAck(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 200) : [];
}

export async function createDraftAction(kind: RecordKind) {
  return runAction(async () => {
    const user = await requireUser("records.create");
    return { id: await createDraft(assertKind(kind), user) };
  });
}

export async function getEditorStateAction(kind: RecordKind, id: string) {
  return runAction(async () => {
    const user = await requireUser("records.edit");
    return recordEditorState(assertKind(kind), id, user);
  });
}

export async function saveDraftAction(kind: RecordKind, id: string, values: FormValues, meta: FieldMetaMap, acknowledged: string[]) {
  return runAction(async () => {
    const user = await requireUser("records.create");
    const k = assertKind(kind);
    await saveDraftData(k, id, sanitizeValues(k, values), sanitizeMeta(k, meta), sanitizeAck(acknowledged), user);
  });
}

export async function checkDuplicatesAction(kind: RecordKind, values: FormValues, excludeId?: string) {
  return runAction(async () => {
    await requireUser("records.read");
    const k = assertKind(kind);
    return findDuplicates(k, sanitizeValues(k, values), excludeId);
  });
}

export async function finalizeRecordAction(kind: RecordKind, id: string, values: FormValues, meta: FieldMetaMap, acknowledged: string[], opts: { allowMissingDocs?: boolean } = {}) {
  return runAction(async () => {
    const user = await requireUser("records.create");
    const k = assertKind(kind);
    const allowMissingDocs = !!opts.allowMissingDocs && can(user.role, "records.saveIncomplete");
    const status = await finalizeRecord(k, id, sanitizeValues(k, values), sanitizeMeta(k, meta), sanitizeAck(acknowledged), user, { allowMissingDocs });
    const pdf = await generateFicha(k, id, user);
    revalidatePath(`/${KIND_LABELS[k].slug}`);
    revalidatePath("/");
    return { status, version: pdf.version };
  });
}

/** Edição de ficha existente: atualiza apenas os campos enviados e regenera o PDF. */
export async function updateRecordAction(
  kind: RecordKind,
  id: string,
  changes: FormValues,
  opts: { meta?: FieldMetaMap; acknowledged?: string[]; regenerate?: boolean; reviewPending?: boolean; reason?: string } = {},
) {
  return runAction(async () => {
    const user = await requireUser("records.edit");
    const k = assertKind(kind);
    const result = await updateRecord(k, id, sanitizeValues(k, changes), user, {
      meta: opts.meta ? sanitizeMeta(k, opts.meta) : undefined,
      acknowledged: opts.acknowledged ? sanitizeAck(opts.acknowledged) : undefined,
      reviewPending: opts.reviewPending,
      reason: opts.reason?.slice(0, 120),
    });
    let pdfVersion: number | null = null;
    if (opts.regenerate !== false && (result.changed.length || opts.regenerate)) {
      pdfVersion = (await generateFicha(k, id, user)).version;
    }
    revalidatePath(`/${KIND_LABELS[k].slug}`);
    revalidatePath(`/${KIND_LABELS[k].slug}/${id}`);
    return { ...result, pdfVersion };
  });
}

export async function removeDocumentAction(kind: RecordKind, recordId: string, docId: string) {
  return runAction(async () => {
    const user = await requireUser("documents.upload");
    await removeDocument(assertKind(kind), recordId, docId, user);
  });
}

export async function archiveRecordAction(kind: RecordKind, id: string) {
  return runAction(async () => {
    const user = await requireUser("records.delete");
    const k = assertKind(kind);
    await archiveRecord(k, id, user);
    revalidatePath(`/${KIND_LABELS[k].slug}`);
    revalidatePath("/");
  });
}

/** Descartar rascunho do próprio assistente (operador ou admin). */
export async function discardDraftAction(kind: RecordKind, id: string) {
  return runAction(async () => {
    const user = await requireUser("records.create");
    const k = assertKind(kind);
    const row = await requireRecord(k, id);
    if (!row.isDraft) throw new DomainError("Somente rascunhos podem ser descartados aqui.");
    if (row.createdBy !== user.id && user.role !== "admin") throw new DomainError("Somente quem iniciou o rascunho pode descartá-lo.");
    await purgeRecord(k, id, user);
  });
}

export async function restoreRecordAction(kind: RecordKind, id: string) {
  return runAction(async () => {
    const user = await requireUser("records.delete");
    const k = assertKind(kind);
    await restoreRecord(k, id, user);
    revalidatePath("/lixeira");
    revalidatePath(`/${KIND_LABELS[k].slug}`);
  });
}

export async function purgeRecordAction(kind: RecordKind, id: string, confirmation: string) {
  return runAction(async () => {
    const user = await requireUser("records.purge");
    const k = assertKind(kind);
    if (confirmation !== "EXCLUIR") throw new DomainError('Digite "EXCLUIR" para confirmar a exclusão definitiva.');
    const row = await requireRecord(k, id, { includeArchived: true });
    if (!row.archivedAt && !row.isDraft) throw new DomainError("Mova o cadastro para a lixeira antes de excluí-lo definitivamente.");
    const files = await purgeRecord(k, id, user);
    revalidatePath("/lixeira");
    return { files };
  });
}

/** Revela dados sensíveis (sem máscara). Registrado em auditoria. */
export async function revealSensitiveAction(kind: RecordKind, id: string) {
  return runAction(async () => {
    const user = await requireUser("sensitive.reveal");
    const k = assertKind(kind);
    const row = await requireRecord(k, id);
    const values = rowToValues(k, row);
    const out: FormValues = {};
    for (const f of FIELDS[k]) if (f.sensitive) out[f.key] = values[f.key];
    await audit({ user, action: "record.sensitive_revealed", entityType: k, entityId: id });
    return out;
  });
}
