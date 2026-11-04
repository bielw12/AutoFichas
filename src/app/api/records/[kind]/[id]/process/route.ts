import { isDocType, isRecordKind, type DocType } from "@/lib/doc-types";
import type { ProcessEvent } from "@/lib/extraction-types";
import { processRecordDocuments } from "@/server/ai/pipeline";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { requireRecord } from "@/server/services/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Processa documentos com IA e transmite o progresso real em NDJSON
 * (um evento JSON por linha) enquanto cada documento avança no pipeline.
 */
export async function POST(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireUser("ai.process");
    const { kind, id } = await ctx.params;
    if (!isRecordKind(kind)) return Response.json({ error: "Tipo inválido." }, { status: 400 });
    await requireRecord(kind, id);
    const body = (await req.json().catch(() => ({}))) as { docTypes?: unknown };
    const docTypes = Array.isArray(body.docTypes) ? (body.docTypes.filter(isDocType) as DocType[]) : undefined;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (e: ProcessEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        try {
          await processRecordDocuments({ kind, recordId: id, docTypes, user, emit });
        } catch (err) {
          console.error("[process]", err);
          emit({ type: "error", code: "falha", message: "Falha inesperada no processamento. Tente novamente." });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
