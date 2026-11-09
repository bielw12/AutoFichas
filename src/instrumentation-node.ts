/**
 * Inicialização no runtime Node.
 * Com o banco embutido (sem DATABASE_URL) ou AUTO_MIGRATE=true, aplica as
 * migrations automaticamente para que `npm run dev` funcione sem passos extras.
 */
import { getDb } from "./server/db";
import { embeddedDbDir, runMigrations, usingEmbeddedDb } from "./server/db/client";

if (usingEmbeddedDb() || process.env.AUTO_MIGRATE === "true") {
  await runMigrations(getDb());
  if (usingEmbeddedDb()) console.log(`[AutoFichas] Banco embutido pronto em ${embeddedDbDir()}`);
}
if (process.env.AUTH_DISABLED === "true") {
  console.warn("[AutoFichas] Login DESATIVADO (AUTH_DISABLED=true). Use apenas em ambiente local de testes.");
}
