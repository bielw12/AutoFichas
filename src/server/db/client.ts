/**
 * Criação da conexão e migrations, compartilhadas entre a aplicação, os
 * scripts (migrate/seed) e os testes. Sem "server-only" para poder ser usado
 * fora do Next.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Os dois drivers expõem a mesma API de consultas do Drizzle; usamos o tipo do
 * node-postgres como tipo comum.
 */
export type DB = NodePgDatabase<typeof schema>;

type Internal = { kind: "pg"; pool: Pool } | { kind: "pglite"; client: PGlite };
const internals = new WeakMap<object, Internal>();

export function usingEmbeddedDb(): boolean {
  return !process.env.DATABASE_URL?.trim();
}

export function embeddedDbDir(): string {
  const dir = process.env.PGLITE_DIR?.trim() || "./data/pglite";
  return dir.startsWith("memory://") ? dir : path.resolve(process.cwd(), dir);
}

export function createDb(): DB {
  if (usingEmbeddedDb()) {
    const dir = embeddedDbDir();
    if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const db = drizzlePglite(client, { schema, casing: "snake_case" });
    internals.set(db, { kind: "pglite", client });
    return db as unknown as DB;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzlePg(pool, { schema, casing: "snake_case" });
  internals.set(db, { kind: "pg", pool });
  return db;
}

export async function closeDbClient(db: DB) {
  const i = internals.get(db);
  if (i?.kind === "pg") await i.pool.end();
  if (i?.kind === "pglite") await i.client.close();
}

/** Aplica as migrations SQL de ./drizzle (idempotente). */
export async function runMigrations(db: DB) {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const i = internals.get(db);
  if (i?.kind === "pglite") await migratePglite(db as unknown as PgliteDatabase<typeof schema>, { migrationsFolder });
  else await migratePg(db, { migrationsFolder });
}
