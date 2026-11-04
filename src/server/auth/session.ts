import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { sessions, users, type User } from "../db/schema";
import { sessionTtlMs } from "../env";
import { can, type Permission, type Role } from "@/lib/permissions";

export const SESSION_COOKIE = "af_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const h = await headers();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: await clientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
  // limpeza oportunista de sessões expiradas
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

function toSessionUser(u: User): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword };
}

/** Usuário da sessão atual (ou null). Memorizado por requisição. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);
  return rows[0] ? toSessionUser(rows[0].user) : null;
});

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/** Para Server Components/Pages: redireciona ao login se não autenticado. */
export async function requirePageUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/?erro=permissao");
  return user;
}

/** Para Server Actions e API Routes: lança AuthError. */
export async function requireUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Sessão expirada. Entre novamente.");
  if (permission && !can(user.role, permission)) throw new AuthError(403, "Você não tem permissão para esta operação.");
  return user;
}
