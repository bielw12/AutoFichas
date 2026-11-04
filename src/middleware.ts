import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * Proteção de rotas (primeira barreira): exige o cookie de sessão. A validação
 * completa da sessão e das permissões acontece no servidor em cada página,
 * Server Action e API Route.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get("af_session")?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/).*)"],
};
