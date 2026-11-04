import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isRecordKind } from "@/lib/doc-types";
import { recordTitle } from "@/lib/fields";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { authorizeFile, fileResponse } from "@/server/file-response";
import { db } from "@/server/db";
import { recordVersions } from "@/server/db/schema";
import { getRecord, ownerCols, rowToValues } from "@/server/services/records";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;
  if (!isRecordKind(kind)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  const url = new URL(req.url);
  const versionParam = url.searchParams.get("version");
  const version = versionParam && /^\d+$/.test(versionParam) ? Number(versionParam) : undefined;

  const auth = await authorizeFile(req, { t: "ficha", kind, id, version });
  if (auth instanceof NextResponse) return auth;
  if (!can(auth.role, "pdf.download")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const record = await getRecord(kind, id, { includeArchived: true });
  if (!record || (record.archivedAt && auth.role !== "admin")) return NextResponse.json({ error: "Ficha não encontrada." }, { status: 404 });

  let key = record.pdfStorageKey;
  if (version) {
    const [v] = await db
      .select()
      .from(recordVersions)
      .where(and(eq(ownerCols(kind).ver, id), eq(recordVersions.version, version)))
      .limit(1);
    key = v?.pdfStorageKey ?? null;
  }
  if (!key) return NextResponse.json({ error: "PDF ainda não gerado." }, { status: 404 });

  const data = await storage().get(key);
  const download = url.searchParams.get("download") === "1";
  const title = recordTitle(kind, rowToValues(kind, record)).replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 80);
  const fileName = `Ficha ${kind === "driver" ? "motorista" : "veiculo"} - ${title}${version ? ` - v${version}` : ""}.pdf`;
  if (download) await audit({ user: auth, action: "pdf.downloaded", entityType: kind, entityId: id, details: { versao: version ?? record.currentVersion } });
  return fileResponse(data, { mime: "application/pdf", fileName, download });
}
