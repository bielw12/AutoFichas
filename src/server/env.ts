import "server-only";

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new Error("APP_SECRET ausente ou muito curto (mínimo 32 caracteres). Veja .env.example.");
  }
  return s;
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
