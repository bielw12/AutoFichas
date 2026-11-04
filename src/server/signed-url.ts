import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appSecret } from "./env";

/**
 * URLs temporárias para visualização de arquivos privados.
 * A assinatura vincula: recurso + usuário + expiração. Além da assinatura, a
 * rota de arquivos também exige sessão válida do mesmo usuário.
 */

const DEFAULT_TTL_S = 10 * 60;

export type FileResource =
  | { t: "doc"; id: string }
  | { t: "ficha"; kind: "driver" | "vehicle"; id: string; version?: number }
  | { t: "logo" };

export function resourceKey(r: FileResource): string {
  if (r.t === "doc") return `doc:${r.id}`;
  if (r.t === "logo") return "logo";
  return `ficha:${r.kind}:${r.id}:${r.version ?? "current"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function signParams(r: FileResource, userId: string, ttlSeconds = DEFAULT_TTL_S): { exp: string; sig: string } {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  return { exp, sig: sign(`${resourceKey(r)}|${userId}|${exp}`) };
}

export function verifySignature(r: FileResource, userId: string, exp: string | null, sig: string | null): "ok" | "expired" | "invalid" {
  if (!exp || !sig || !/^\d+$/.test(exp)) return "invalid";
  const expected = Buffer.from(sign(`${resourceKey(r)}|${userId}|${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  if (Number(exp) < Math.floor(Date.now() / 1000)) return "expired";
  return "ok";
}

export function signedDocUrl(docId: string, userId: string, opts: { download?: boolean } = {}): string {
  const { exp, sig } = signParams({ t: "doc", id: docId }, userId);
  return `/api/files/doc/${docId}?exp=${exp}&sig=${sig}${opts.download ? "&download=1" : ""}`;
}

export function signedFichaUrl(kind: "driver" | "vehicle", id: string, userId: string, opts: { version?: number; download?: boolean } = {}): string {
  const { exp, sig } = signParams({ t: "ficha", kind, id, version: opts.version }, userId);
  const v = opts.version ? `&version=${opts.version}` : "";
  return `/api/files/ficha/${kind}/${id}?exp=${exp}&sig=${sig}${v}${opts.download ? "&download=1" : ""}`;
}

export function signedLogoUrl(userId: string): string {
  const { exp, sig } = signParams({ t: "logo" }, userId, 3600);
  return `/api/files/logo?exp=${exp}&sig=${sig}`;
}
