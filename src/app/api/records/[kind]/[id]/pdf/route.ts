import { NextResponse } from "next/server";
import { isRecordKind } from "@/lib/doc-types";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { generateFicha } from "@/server/services/ficha";
import { signedFichaUrl } from "@/server/signed-url";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Gera (ou regenera) o PDF da ficha no servidor a partir dos dados salvos. */
export async function POST(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireUser("pdf.generate");
    const { kind, id } = await ctx.params;
    if (!isRecordKind(kind)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    const result = await generateFicha(kind, id, user);
    return NextResponse.json({
      pageCount: result.pageCount,
      version: result.version,
      size: result.size,
      url: signedFichaUrl(kind, id, user.id),
      downloadUrl: signedFichaUrl(kind, id, user.id, { download: true }),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
