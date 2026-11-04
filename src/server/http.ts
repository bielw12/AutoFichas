import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "./auth/session";
import { UploadError } from "./files/validate";
import { DomainError } from "./services/records";

/** Bloqueia requisições de outras origens em rotas que alteram dados. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // navegadores sempre enviam Origin em POST/DELETE via fetch
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthError(403, "Origem inválida.");
  }
  const allowed = new Set([host, process.env.APP_URL ? new URL(process.env.APP_URL).host : null].filter(Boolean));
  if (!allowed.has(originHost)) throw new AuthError(403, "Origem não permitida.");
}

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof DomainError) {
    const status = err.code === "not_found" ? 404 : err.code === "duplicate" || err.code === "conflict" ? 409 : 400;
    return NextResponse.json({ error: err.message, code: err.code, details: err.extra ?? null }, { status });
  }
  console.error("[api]", err);
  return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string; details?: unknown };

/** Envolve Server Actions convertendo exceções conhecidas em resultado tipado. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return { ok: false, error: err.message, code: err instanceof AuthError ? `auth_${err.status}` : "upload" };
    if (err instanceof DomainError) return { ok: false, error: err.message, code: err.code, details: err.extra ?? null };
    // Erros de navegação do Next (redirect/notFound) precisam ser propagados
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    console.error("[action]", err);
    return { ok: false, error: "Erro interno. Tente novamente." };
  }
}
