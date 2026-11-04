import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __afPool?: Pool; __afDb?: DB };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada. Veja o arquivo .env.example.");
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

export function getDb(): DB {
  if (!globalForDb.__afDb) {
    globalForDb.__afPool = createPool();
    globalForDb.__afDb = drizzle(globalForDb.__afPool, { schema, casing: "snake_case" });
  }
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
  await globalForDb.__afPool?.end();
  globalForDb.__afPool = undefined;
  globalForDb.__afDb = undefined;
}

export { schema };
