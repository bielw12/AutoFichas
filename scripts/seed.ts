/**
 * Cria o usuário administrador inicial a partir das variáveis ADMIN_NAME,
 * ADMIN_EMAIL e ADMIN_PASSWORD. Não cria dados fictícios de cadastros.
 *
 * Uso: npm run db:seed
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/server/db";
import { users } from "../src/server/db/schema";
import { getSettings } from "../src/server/services/settings";
import { createUser } from "../src/server/services/users";

async function main() {
  await getSettings();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) {
    console.log(`Já existem ${n} usuário(s). Nada a fazer.`);
    return;
  }
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password) {
    throw new Error("Defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no .env para criar o administrador inicial.");
  }
  await createUser({ name, email, role: "admin", password }, null);
  console.log(`Administrador criado: ${email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
