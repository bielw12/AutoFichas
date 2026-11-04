import { NextResponse } from "next/server";
import { authorizeFile, fileResponse } from "@/server/file-response";
import { getLogo, getSettings } from "@/server/services/settings";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authorizeFile(req, { t: "logo" });
  if (auth instanceof NextResponse) return auth;
  const logo = await getLogo(await getSettings());
  if (!logo) return NextResponse.json({ error: "Logotipo não configurado." }, { status: 404 });
  return fileResponse(logo.data, { mime: logo.mime, fileName: "logotipo", download: false });
}
