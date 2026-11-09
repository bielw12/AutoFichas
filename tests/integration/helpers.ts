import path from "node:path";
import { rm } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { Role } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth/session";
import { db, getDb } from "@/server/db";
import { runMigrations } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { createUser } from "@/server/services/users";

let migrated = false;

export async function resetDatabase() {
  if (!migrated) {
    await runMigrations(getDb());
    migrated = true;
  }
  await db.execute(
    sql`truncate table audit_logs, record_versions, extraction_results, documents, drivers, vehicles, sessions, login_attempts, company_settings, users restart identity cascade`,
  );
  await db.insert(companySettings).values({ id: 1, companyName: "Transportadora Fictícia de Testes", phones: "(11) 90000-0000", emails: "contato@exemplo.com.br", website: "www.exemplo.com.br" });
  await rm(path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "./storage-test"), { recursive: true, force: true });
}

export async function makeUser(role: Role, name = `Usuário ${role}`): Promise<SessionUser> {
  const email = `${role}-${Math.random().toString(36).slice(2, 8)}@teste.local`;
  const { id } = await createUser({ name, email, role, password: "SenhaForte123" }, null);
  return { id, name, email, role, mustChangePassword: false };
}
