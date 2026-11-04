import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/auth/session";
import { authorizeFile, fileResponse } from "@/server/file-response";
import { toRaster } from "@/server/files/images";
import { getDocument, readDocumentFile } from "@/server/services/documents";
import { getRecord } from "@/server/services/records";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorizeFile(req, { t: "doc", id });
  if (auth instanceof NextResponse) return auth;
  if (!can(auth.role, "documents.read")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const recordId = doc.driverId ?? doc.vehicleId!;
  const record = await getRecord(doc.recordKind, recordId, { includeArchived: true });
  if (!record) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  // Itens na lixeira: somente administradores
  if (record.archivedAt && auth.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  let data = await readDocumentFile(doc);
  let mime = doc.mimeType;
  let name = doc.originalName;
  // HEIC não é exibido pela maioria dos navegadores: converte para JPEG na visualização
  if (mime === "image/heic" && !download) {
    data = (await toRaster(data, mime, { maxSide: 2400 })).data;
    mime = "image/jpeg";
    name = name.replace(/\.hei[cf]$/i, "") + ".jpg";
  }
  await audit({ user: auth, action: "document.viewed", entityType: doc.recordKind, entityId: recordId, details: { tipo: doc.docType, documentoId: doc.id, download }, ip: await clientIp() });
  return fileResponse(data, { mime, fileName: name, download });
}
