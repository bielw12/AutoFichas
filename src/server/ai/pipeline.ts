import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { DOC_TYPES, type DocType, type RecordKind } from "@/lib/doc-types";
import { getDocSchema } from "@/lib/extraction-schemas";
import type { ExtractionSummary, ProcessEvent } from "@/lib/extraction-types";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { documents, extractionResults, type DocumentRow } from "../db/schema";
import { getLatestExtractions, listCurrentDocuments, ownerCols, requireRecord, toExtractionSummary } from "../services/records";
import { getSettings } from "../services/settings";
import { storage } from "../storage";
import { postProcess } from "./postprocess";
import { getProvider, providerStatus } from "./registry";
import { ProviderError, type ExtractionProvider } from "./types";

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

/**
 * Processa (ou reprocessa) os documentos de um cadastro com o provedor de IA
 * configurado, emitindo eventos reais de progresso por documento.
 *
 * Pipeline: carregar original → identificar tipo + extrair (provedor) →
 * validar/normalizar → atribuir confiança → salvar resultado.
 */
export async function processRecordDocuments(args: {
  kind: RecordKind;
  recordId: string;
  docTypes?: DocType[];
  user: SessionUser;
  emit: (e: ProcessEvent) => void;
  provider?: ExtractionProvider | null;
}) {
  const { kind, recordId, user, emit } = args;
  await requireRecord(kind, recordId);

  const provider = args.provider === undefined ? getProvider() : args.provider;
  if (!provider) {
    emit({ type: "error", code: "ai_not_configured", message: providerStatus().message });
    return;
  }
  if (provider.external) {
    const settings = await getSettings();
    if (!settings.externalAiEnabled) {
      emit({
        type: "error",
        code: "external_disabled",
        message: `O envio de documentos ao provedor externo (${provider.label}) ainda não foi autorizado. Um administrador deve habilitá-lo em Configurações → Inteligência artificial, após avaliar os requisitos de privacidade (LGPD).`,
      });
      return;
    }
  }

  const docs = await listCurrentDocuments(kind, recordId);
  const groups = new Map<DocType, DocumentRow[]>();
  for (const d of docs) {
    if (!DOC_TYPES[d.docType].extractable) continue;
    if (args.docTypes && !args.docTypes.includes(d.docType)) continue;
    groups.set(d.docType, [...(groups.get(d.docType) ?? []), d]);
  }
  const types = [...groups.keys()];
  emit({ type: "start", docTypes: types, provider: provider.label });

  const own = ownerCols(kind);

  await runWithConcurrency(types, 3, async (docType) => {
    const group = groups.get(docType)!;
    const schema = getDocSchema(docType)!;
    const ids = group.map((d) => d.id);
    const started = Date.now();
    await db.update(documents).set({ processingStatus: "processando", processingMessage: null }).where(inArray(documents.id, ids));

    try {
      emit({ type: "stage", docType, stage: "preparando" });
      const files = await Promise.all(group.map(async (d) => ({ name: d.originalName, mime: d.mimeType, data: await storage().get(d.storageKey) })));

      emit({ type: "stage", docType, stage: "analisando" });
      const out = await provider.extract({ expectedType: docType, schema, files });

      emit({ type: "stage", docType, stage: "validando" });
      const pp = postProcess(docType, schema, out);

      const [saved] = await db
        .insert(extractionResults)
        .values({
          recordKind: kind,
          [own.ownerField]: recordId,
          docType,
          documentId: ids[0],
          documentIds: ids,
          provider: provider.id,
          model: out.model,
          detectedType: pp.detectedType,
          matchesExpected: pp.matchesExpected,
          legibility: pp.legibility,
          fields: pp.fields,
          warnings: pp.warnings,
          missingFields: pp.missingFields,
          durationMs: Date.now() - started,
          createdBy: user.id,
        })
        .returning();

      const status = pp.legibility === "ilegivel" ? "ilegivel" : !pp.matchesExpected ? "incompativel" : "processado";
      const message =
        status === "ilegivel"
          ? "Documento ilegível. Envie um novo arquivo."
          : status === "incompativel"
            ? `Parece ser outro tipo de documento${pp.detectedType ? ` (${pp.detectedType})` : ""}.`
            : null;
      await db.update(documents).set({ processingStatus: status, processingMessage: message }).where(inArray(documents.id, ids));

      const summary = toExtractionSummary(saved);
      emit({ type: "result", docType, extraction: summary });
      if (status !== "processado") emit({ type: "doc_error", docType, message: message!, code: status === "ilegivel" ? "ilegivel" : "incompativel" });
      emit({ type: "stage", docType, stage: status === "processado" ? "concluido" : "erro" });
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : "Falha inesperada ao processar o documento.";
      if (!(err instanceof ProviderError)) console.error("[pipeline]", docType, err);
      await db.insert(extractionResults).values({
        recordKind: kind,
        [own.ownerField]: recordId,
        docType,
        documentId: ids[0],
        documentIds: ids,
        provider: provider.id,
        model: provider.model,
        error: message,
        durationMs: Date.now() - started,
        createdBy: user.id,
      });
      await db.update(documents).set({ processingStatus: "erro", processingMessage: message }).where(inArray(documents.id, ids));
      emit({ type: "doc_error", docType, message, code: "falha" });
      emit({ type: "stage", docType, stage: "erro" });
    }
  });

  emit({ type: "organizing" });
  await audit({ user, action: "ai.processed", entityType: kind, entityId: recordId, details: { tipos: types, provedor: provider.id } });
  const extractions = await getLatestExtractions(kind, recordId);
  emit({ type: "done", extractions });
}

/** Coleta eventos em memória (útil para testes e chamadas não-streaming). */
export async function processAndCollect(args: Omit<Parameters<typeof processRecordDocuments>[0], "emit">): Promise<{ events: ProcessEvent[]; extractions: ExtractionSummary[] }> {
  const events: ProcessEvent[] = [];
  await processRecordDocuments({ ...args, emit: (e) => events.push(e) });
  const done = events.find((e) => e.type === "done");
  return { events, extractions: done && done.type === "done" ? done.extractions : [] };
}

export async function currentDocsOfType(kind: RecordKind, recordId: string, docType: DocType) {
  return db
    .select()
    .from(documents)
    .where(and(eq(ownerCols(kind).doc, recordId), eq(documents.docType, docType), isNull(documents.supersededAt)));
}
