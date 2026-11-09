import { config } from "dotenv";

config({ path: ".env", quiet: true } as Parameters<typeof config>[0]);

// Banco e armazenamento isolados para testes
// DATABASE_URL_TEST=pglite → banco embutido em memória (sem PostgreSQL instalado)
if (process.env.DATABASE_URL_TEST === "pglite") {
  process.env.DATABASE_URL = "";
  process.env.PGLITE_DIR = "memory://";
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://autofichas:autofichas@localhost:5432/autofichas_test";
}
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./storage-test";
process.env.APP_SECRET = process.env.APP_SECRET && process.env.APP_SECRET.length >= 32 ? process.env.APP_SECRET : "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
process.env.STORAGE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.AI_PROVIDER = "local";
process.env.AUTH_DISABLED = "false";
