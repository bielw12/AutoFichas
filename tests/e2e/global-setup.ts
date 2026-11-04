import path from "node:path";
import { rm } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { writeFixtures } from "../fixtures/documents";
import { hashPassword } from "../../src/server/auth/password";
import { E2E_ENV } from "../../playwright.config";
import { E2E_USERS } from "./users";

/** Prepara banco limpo, usuários de teste e documentos fictícios. */
export default async function globalSetup() {
  const pool = new Pool({ connectionString: E2E_ENV.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
  await pool.query(
    "truncate table audit_logs, record_versions, extraction_results, documents, drivers, vehicles, sessions, login_attempts, company_settings, users restart identity cascade",
  );
  await pool.query(
    `insert into company_settings (id, company_name, phones, emails, website) values (1, 'Transportadora Fictícia E2E', '(11) 90000-0000', 'operacional@exemplo.com.br', 'www.exemplo.com.br')`,
  );
  for (const u of Object.values(E2E_USERS)) {
    await pool.query("insert into users (name, email, password_hash, role) values ($1, $2, $3, $4)", [u.name, u.email, await hashPassword(u.password), u.role]);
  }
  await pool.end();
  await rm(path.resolve(E2E_ENV.STORAGE_LOCAL_DIR), { recursive: true, force: true });
  await writeFixtures(path.resolve("test-results/fixtures-e2e"));
}
