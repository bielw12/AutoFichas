import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { isRole, type Role } from "@/lib/permissions";
import { isValidEmail } from "@/lib/validators";
import { audit } from "../audit";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../auth/password";
import { destroyUserSessions, type SessionUser } from "../auth/session";
import { db } from "../db";
import { loginAttempts, users } from "../db/schema";
import { DomainError } from "./records";

export async function listUsers() {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.name));
}

export function generateTempPassword(): string {
  return `${randomBytes(9).toString("base64url")}9a`;
}

export async function createUser(input: { name: string; email: string; role: string; password?: string }, actor: SessionUser | null) {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new DomainError("Informe o nome.");
  if (!isValidEmail(email)) throw new DomainError("E-mail inválido.");
  if (!isRole(input.role)) throw new DomainError("Perfil inválido.");
  const password = input.password || generateTempPassword();
  const weak = validatePasswordStrength(password);
  if (weak) throw new DomainError(weak);
  const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (existing.length) throw new DomainError("Já existe um usuário com este e-mail.", "duplicate");
  const [row] = await db
    .insert(users)
    .values({ name, email, role: input.role, passwordHash: await hashPassword(password), mustChangePassword: !input.password || !!actor })
    .returning({ id: users.id });
  await audit({ user: actor, action: "user.created", entityType: "user", entityId: row.id, details: { perfil: input.role } });
  return { id: row.id, password };
}

export async function updateUser(id: string, input: { name?: string; role?: Role; active?: boolean }, actor: SessionUser) {
  if (id === actor.id && (input.role && input.role !== "admin" || input.active === false)) {
    throw new DomainError("Você não pode remover seu próprio acesso de administrador.");
  }
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 120);
  if (input.role !== undefined) {
    if (!isRole(input.role)) throw new DomainError("Perfil inválido.");
    patch.role = input.role;
  }
  if (input.active !== undefined) patch.active = input.active;
  await db.update(users).set(patch).where(eq(users.id, id));
  if (input.active === false || input.role !== undefined) await destroyUserSessions(id);
  await audit({ user: actor, action: "user.updated", entityType: "user", entityId: id, details: { perfil: input.role ?? null, ativo: input.active ?? null } });
}

export async function resetUserPassword(id: string, actor: SessionUser) {
  const password = generateTempPassword();
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
  await destroyUserSessions(id);
  await audit({ user: actor, action: "user.password_reset", entityType: "user", entityId: id });
  return password;
}

export async function changeOwnPassword(user: SessionUser, current: string, next: string) {
  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  if (!row || !(await verifyPassword(current, row.passwordHash))) throw new DomainError("Senha atual incorreta.");
  const weak = validatePasswordStrength(next);
  if (weak) throw new DomainError(weak);
  if (current === next) throw new DomainError("A nova senha deve ser diferente da atual.");
  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id));
  await audit({ user, action: "auth.password_changed", entityType: "user", entityId: user.id });
}

// ------------------------------------------------- Proteção contra força bruta

const WINDOW_MIN = 15;
const MAX_FAILS = 8;

export async function isLoginBlocked(keys: string[]): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MIN * 60000);
  for (const key of keys) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.key, key), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)));
    if (n >= MAX_FAILS) return true;
  }
  return false;
}

export async function recordLoginAttempt(keys: string[], success: boolean) {
  await db.insert(loginAttempts).values(keys.map((key) => ({ key, success })));
  if (success) {
    await db.delete(loginAttempts).where(and(eq(loginAttempts.key, keys[0]), eq(loginAttempts.success, false)));
  }
}

export async function authenticate(email: string, password: string) {
  const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).limit(1);
  // Executa o hash mesmo quando o usuário não existe (tempo constante)
  const ok = await verifyPassword(password, row?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!row || !ok || !row.active) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  return row;
}
