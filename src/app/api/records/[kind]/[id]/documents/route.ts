import { NextResponse } from "next/server";
import { isDocType, isRecordKind } from "@/lib/doc-types";
import { requireUser } from "@/server/auth/session";
import { maxUploadBytes } from "@/server/env";
import { UploadError } from "@/server/files/validate";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { uploadDocument } from "@/server/services/documents";
import { toPublicDocument } from "@/server/views";

export const runtime = "nodejs";

/** Upload de um documento (multipart/form-data: file, docType, replaceId?). */
export async function POST(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireUser("documents.upload");
    const { kind, id } = await ctx.params;
    if (!isRecordKind(kind)) throw new UploadError("Tipo de cadastro inválido.");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > maxUploadBytes() + 64 * 1024) throw new UploadError(`Arquivo excede o limite de ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);

    const form = await req.formData();
    const file = form.get("file");
    const docType = form.get("docType");
    const replaceId = form.get("replaceId");
    if (!(file instanceof File)) throw new UploadError("Nenhum arquivo enviado.");
    if (!isDocType(docType)) throw new UploadError("Tipo de documento inválido.");

    const row = await uploadDocument({
      kind,
      recordId: id,
      docType,
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      user,
      replaceId: typeof replaceId === "string" && replaceId ? replaceId : null,
    });
    return NextResponse.json({ document: toPublicDocument(row, user) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
