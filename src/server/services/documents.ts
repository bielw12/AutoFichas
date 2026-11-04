import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { DOC_TYPES, docTypeAllowedFor, type DocType, type RecordKind } from "@/lib/doc-types";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { documents, type DocumentRow } from "../db/schema";
import { maxFilesPerDocument } from "../env";
import { UploadError, validateUpload } from "../files/validate";
import { storage, storageKeys } from "../storage";
import { DomainError, ownerCols, registerDocumentChange, requireRecord } from "./records";

export interface PublicDocument {
  id: string;
  docType: DocType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  processingStatus: DocumentRow["processingStatus"];
  processingMessage: string | null;
  uploadedAt: string;
  url: string;
}

/** Etapas 1–3 do pipeline: receber, validar e armazenar o original. */
export async function uploadDocument(args: {
  kind: RecordKind;
  recordId: string;
  docType: DocType;
  fileName: string;
  buffer: Buffer;
  user: SessionUser;
  /** Substitui um documento existente (mantém o anterior no histórico). */
  replaceId?: string | null;
}): Promise<DocumentRow> {
  const { kind, recordId, docType, user } = args;
  if (!docTypeAllowedFor(kind, docType)) throw new UploadError("Tipo de documento não pertence a este cadastro.");
  await requireRecord(kind, recordId);
  const own = ownerCols(kind);

  const current = await db
    .select()
    .from(documents)
    .where(and(eq(own.doc, recordId), eq(documents.docType, docType), isNull(documents.supersededAt)));

  let replaced: DocumentRow | undefined;
  if (args.replaceId) {
    replaced = current.find((d) => d.id === args.replaceId);
    if (!replaced) throw new UploadError("Documento a substituir não encontrado.");
  } else if (!DOC_TYPES[docType].multiple && current.length >= 1) {
    replaced = current[0];
  } else if (current.length >= maxFilesPerDocument()) {
    throw new UploadError(`Limite de ${maxFilesPerDocument()} arquivos para este documento.`);
  }

  const file = await validateUpload(args.buffer, args.fileName, docType);
  const duplicate = current.find((d) => d.sha256 === file.sha256 && d.id !== replaced?.id);
  if (duplicate) throw new UploadError(`Este arquivo já foi enviado (${duplicate.originalName}).`);

  const id = crypto.randomUUID();
  const key = storageKeys.document(kind, recordId, id, file.ext);
  await storage().put(key, file.buffer, file.mime);

  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${documents.position}), -1)::int` })
    .from(documents)
    .where(and(eq(own.doc, recordId), eq(documents.docType, docType)));

  const [row] = await db
    .insert(documents)
    .values({
      id,
      recordKind: kind,
      [own.ownerField]: recordId,
      docType,
      originalName: file.safeName,
      storageKey: key,
      mimeType: file.mime,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      pageCount: file.pageCount,
      position: replaced ? replaced.position : maxPos + 1,
      processingStatus: DOC_TYPES[docType].extractable ? "enviado" : "nao_aplicavel",
      uploadedBy: user.id,
    })
    .returning();

  if (replaced) {
    await db.update(documents).set({ supersededAt: new Date(), supersededBy: user.id }).where(eq(documents.id, replaced.id));
  }

  await audit({
    user,
    action: replaced ? "document.replaced" : "document.uploaded",
    entityType: kind,
    entityId: recordId,
    details: { tipo: docType, formato: file.mime, tamanho: file.sizeBytes, paginas: file.pageCount, documentoId: id },
  });
  await registerDocumentChange(kind, recordId, { action: replaced ? "substituído" : "adicionado", docType, name: file.safeName }, user);
  return row;
}

export async function removeDocument(kind: RecordKind, recordId: string, docId: string, user: SessionUser) {
  const own = ownerCols(kind);
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(own.doc, recordId), isNull(documents.supersededAt)));
  if (!doc) throw new DomainError("Documento não encontrado.", "not_found");
  const record = await requireRecord(kind, recordId);

  if (record.isDraft) {
    // Rascunho: remoção definitiva (o arquivo nunca fez parte de uma ficha salva)
    await storage().delete([doc.storageKey]);
    await db.delete(documents).where(eq(documents.id, docId));
  } else {
    await db.update(documents).set({ supersededAt: new Date(), supersededBy: user.id }).where(eq(documents.id, docId));
  }
  await audit({ user, action: "document.removed", entityType: kind, entityId: recordId, details: { tipo: doc.docType, documentoId: docId } });
  await registerDocumentChange(kind, recordId, { action: "removido", docType: doc.docType, name: doc.originalName }, user);
}

export async function getDocument(docId: string): Promise<DocumentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return null;
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
  return doc ?? null;
}

export async function readDocumentFile(doc: DocumentRow): Promise<Buffer> {
  return storage().get(doc.storageKey);
}
