/**
 * Rotina de retenção (rascunhos inativos, lixeira, documentos substituídos,
 * sessões expiradas). Agende diariamente (cron, GitHub Actions, Supabase cron…).
 *
 * Uso: npm run maintenance
 */
import "dotenv/config";
import { closeDb } from "../src/server/db";
import { runRetention } from "../src/server/services/maintenance";

runRetention(null)
  .then((r) => console.log("Retenção executada:", r))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
