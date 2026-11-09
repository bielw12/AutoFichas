import "dotenv/config";
import { createDb, closeDbClient, embeddedDbDir, runMigrations, usingEmbeddedDb } from "../src/server/db/client";

async function main() {
  const db = createDb();
  console.log(usingEmbeddedDb() ? `Aplicando migrations no banco embutido (${embeddedDbDir()})...` : "Aplicando migrations...");
  await runMigrations(db);
  console.log("Migrations aplicadas com sucesso.");
  await closeDbClient(db);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
