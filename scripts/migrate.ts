import "dotenv/config";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  const db = drizzle(pool);
  console.log("Aplicando migrations...");
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  console.log("Migrations aplicadas com sucesso.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
