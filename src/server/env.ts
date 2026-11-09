import "server-only";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

let generatedSecret: string | null = null;

/**
 * Segredo para assinar URLs temporárias. Se APP_SECRET não for definido, um
 * segredo aleatório é gerado e guardado em ./data/.app-secret (uso local).
 * Em produção, defina APP_SECRET explicitamente.
 */
export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (s) throw new Error("APP_SECRET muito curto (mínimo 32 caracteres). Veja .env.example.");
  if (generatedSecret) return generatedSecret;
  const file = path.resolve(process.cwd(), "data", ".app-secret");
  if (existsSync(file)) {
    generatedSecret = readFileSync(file, "utf8").trim();
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    generatedSecret = randomBytes(48).toString("base64url");
    writeFileSync(file, generatedSecret, { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {}
    console.warn(`[AutoFichas] APP_SECRET não definido: segredo local gerado em ${file}. Defina APP_SECRET em produção.`);
  }
  return generatedSecret;
}

/** Login desativado para testes locais (AUTH_DISABLED=true). */
export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true";
}

export function sessionTtlMs(): number {
  const h = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(h) && h > 0 ? h : 12) * 3600 * 1000;
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 15);
  return (Number.isFinite(mb) && mb > 0 ? mb : 15) * 1024 * 1024;
}

export function maxFilesPerDocument(): number {
  const n = Number(process.env.MAX_FILES_PER_DOCUMENT ?? 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}
