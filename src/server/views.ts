import "server-only";
import type { RecordKind } from "@/lib/doc-types";
import type { FieldMetaMap } from "@/lib/field-meta";
import { FIELDS, type FormValues } from "@/lib/fields";
import { maskValue } from "@/lib/display";
import { can } from "@/lib/permissions";
import type { SessionUser } from "./auth/session";
import type { DocumentRow } from "./db/schema";
import type { PublicDocument } from "./services/documents";
import { getLatestExtractions, listCurrentDocuments, pendingDocTypes, recordStatusInfo, requireRecord, rowToValues } from "./services/records";
import { signedDocUrl, signedFichaUrl } from "./signed-url";

export function toPublicDocument(d: DocumentRow, user: SessionUser): PublicDocument {
  return {
    id: d.id,
    docType: d.docType,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    processingStatus: d.processingStatus,
    processingMessage: d.processingMessage,
    uploadedAt: d.uploadedAt.toISOString(),
    url: signedDocUrl(d.id, user.id),
  };
}

/** Mascara campos sensíveis para perfis sem permissão de visualização integral. */
export function maskForUser(kind: RecordKind, values: FormValues, user: SessionUser, reveal = false): FormValues {
  if (reveal && can(user.role, "sensitive.reveal")) return values;
  const out = { ...values };
  for (const f of FIELDS[kind]) if (f.sensitive && out[f.key]) out[f.key] = maskValue(f, out[f.key]);
  return out;
}

/** Estado completo de um cadastro para o assistente/edição (somente quem pode editar). */
export async function recordEditorState(kind: RecordKind, id: string, user: SessionUser) {
  const row = await requireRecord(kind, id);
  const docs = await listCurrentDocuments(kind, id);
  const extractions = await getLatestExtractions(kind, id);
  const { status, expiries } = await recordStatusInfo(kind, row);
  return {
    kind,
    id: row.id,
    isDraft: row.isDraft,
    values: rowToValues(kind, row),
    meta: (row.fieldMeta ?? {}) as FieldMetaMap,
    acknowledged: row.acknowledgedIssues ?? [],
    documents: docs.map((d) => toPublicDocument(d, user)),
    extractions,
    pending: pendingDocTypes(docs, extractions),
    status,
    expiries,
    reviewPending: row.reviewPending,
    pdf: row.pdfStorageKey
      ? {
          url: signedFichaUrl(kind, row.id, user.id),
          downloadUrl: signedFichaUrl(kind, row.id, user.id, { download: true }),
          generatedAt: row.pdfGeneratedAt?.toISOString() ?? null,
          stale: row.pdfStale,
        }
      : null,
    version: row.currentVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type RecordEditorState = Awaited<ReturnType<typeof recordEditorState>>;
