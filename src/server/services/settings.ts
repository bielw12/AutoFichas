import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db";
import { companySettings, type CompanySettings } from "../db/schema";
import { storage } from "../storage";

export const getSettings = cache(async (): Promise<CompanySettings> => {
  const rows = await db.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(companySettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(companySettings).where(eq(companySettings.id, 1)))[0];
});

export async function getLogo(settings: CompanySettings): Promise<{ data: Buffer; mime: string } | null> {
  if (!settings.logoStorageKey) return null;
  try {
    return { data: await storage().get(settings.logoStorageKey), mime: settings.logoMime ?? "image/png" };
  } catch {
    return null;
  }
}

export function isSettingsConfigured(s: CompanySettings): boolean {
  return !!s.companyName.trim();
}
