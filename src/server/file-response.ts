import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth/session";
import { verifySignature, type FileResource } from "./signed-url";

/** Exige sessão válida + assinatura temporária do mesmo usuário. */
export async function authorizeFile(req: Request, resource: FileResource): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const url = new URL(req.url);
  const check = verifySignature(resource, user.id, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (check === "expired") return NextResponse.json({ error: "Link expirado. Atualize a página." }, { status: 403 });
  if (check !== "ok") return NextResponse.json({ error: "Link inválido." }, { status: 403 });
  return user;
}

export function fileResponse(data: Buffer, opts: { mime: string; fileName: string; download: boolean }) {
  const ascii = opts.fileName.normalize("NFD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "_") || "arquivo";
  const disposition = `${opts.download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`;
  const headers: Record<string, string> = {
    "content-type": opts.mime,
    "content-length": String(data.length),
    "content-disposition": disposition,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
  };
  // Imagens: sem execução de conteúdo ativo. (PDFs precisam do visualizador nativo.)
  if (opts.mime.startsWith("image/")) headers["content-security-policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
  return new NextResponse(new Uint8Array(data), { status: 200, headers });
}
