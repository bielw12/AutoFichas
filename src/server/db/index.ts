import "server-only";
import { createDb, closeDbClient, type DB } from "./client";

export type { DB };

const globalForDb = globalThis as unknown as { __afDb?: DB };

/**
 * Conexão única por processo (sobrevive ao recarregamento do Next em dev).
 * - DATABASE_URL definido → PostgreSQL (local, Docker ou Supabase).
 * - DATABASE_URL vazio    → PostgreSQL embutido (PGlite) em PGLITE_DIR, sem instalação.
 */
export function getDb(): DB {
  globalForDb.__afDb ??= createDb();
  return globalForDb.__afDb;
}

export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export async function closeDb() {
  const current = globalForDb.__afDb;
  globalForDb.__afDb = undefined;
  if (current) await closeDbClient(current);
}

export * as schema from "./schema";
