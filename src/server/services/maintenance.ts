import "server-only";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { RECORD_KINDS } from "@/lib/doc-types";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { documents, loginAttempts, sessions } from "../db/schema";
import { storage } from "../storage";
import { purgeRecord, tableFor } from "./records";
import { getSettings } from "./settings";

/**
 * Política de retenção configurável:
 *  - rascunhos sem atividade há N dias são excluídos;
 *  - itens da lixeira há mais de N dias são excluídos definitivamente;
 *  - documentos substituídos há mais de N dias (lixeira) têm o arquivo removido;
 *  - sessões expiradas e tentativas de login antigas são apagadas.
 */
export async function runRetention(actor: SessionUser | null) {
  const s = await getSettings();
  const draftCut = new Date(Date.now() - s.draftRetentionDays * 86400000);
  const trashCut = new Date(Date.now() - s.trashRetentionDays * 86400000);
  const result = { rascunhos: 0, lixeira: 0, documentosSubstituidos: 0 };

  for (const kind of RECORD_KINDS) {
    const t = tableFor(kind);
    const drafts = await db.select({ id: t.id }).from(t).where(and(eq(t.isDraft, true), lt(t.updatedAt, draftCut)));
    for (const r of drafts) {
      await purgeRecord(kind, r.id, actor);
      result.rascunhos++;
    }
    const trashed = await db.select({ id: t.id }).from(t).where(and(isNotNull(t.archivedAt), lt(t.archivedAt, trashCut)));
    for (const r of trashed) {
      await purgeRecord(kind, r.id, actor);
      result.lixeira++;
    }
  }

  const oldDocs = await db
    .select({ id: documents.id, key: documents.storageKey })
    .from(documents)
    .where(and(isNotNull(documents.supersededAt), lt(documents.supersededAt, trashCut)));
  if (oldDocs.length) {
    await storage().delete(oldDocs.map((d) => d.key));
    for (const d of oldDocs) await db.delete(documents).where(eq(documents.id, d.id));
    result.documentosSubstituidos = oldDocs.length;
  }

  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, sql`now() - interval '30 days'`));
  await audit({ user: actor, action: "maintenance.retention", entityType: "system", details: result });
  return result;
}
