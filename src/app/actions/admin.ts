"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { companySettings } from "@/server/db/schema";
import { detectMime, EXT_BY_MIME } from "@/server/files/validate";
import { runAction } from "@/server/http";
import { runRetention } from "@/server/services/maintenance";
import { DomainError } from "@/server/services/records";
import { getSettings } from "@/server/services/settings";
import { createUser, resetUserPassword, updateUser } from "@/server/services/users";
import { storage, storageKeys } from "@/server/storage";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");
const settingsSchema = z.object({
  companyName: z.string().trim().max(120),
  cnpj: z.string().trim().max(20).transform((s) => s.replace(/\D/g, "")),
  phones: z.string().trim().max(300),
  emails: z.string().trim().max(400),
  website: z.string().trim().max(200),
  address: z.string().trim().max(300),
  footerText: z.string().trim().max(300),
  primaryColor: hex,
  accentColor: hex,
  footerOnDocuments: z.boolean(),
  includeBankPage: z.boolean(),
  expiryWarningDays: z.coerce.number().int().min(1).max(365),
  draftRetentionDays: z.coerce.number().int().min(1).max(3650),
  trashRetentionDays: z.coerce.number().int().min(1).max(3650),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export async function updateSettingsAction(input: SettingsInput) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await getSettings();
    await db.update(companySettings).set({ ...parsed.data, updatedBy: user.id, updatedAt: new Date() }).where(eq(companySettings.id, 1));
    await audit({ user, action: "settings.updated", entityType: "settings", details: { campos: Object.keys(parsed.data) } });
    revalidatePath("/", "layout");
  });
}

export async function uploadLogoAction(form: FormData) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const file = form.get("logo");
    if (!(file instanceof File)) throw new DomainError("Selecione um arquivo.");
    if (file.size > 1.5 * 1024 * 1024) throw new DomainError("O logotipo deve ter no máximo 1,5 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = detectMime(buf);
    if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") throw new DomainError("Use PNG (preferencialmente com fundo transparente), JPG ou WEBP.");
    const current = await getSettings();
    const key = storageKeys.logo(EXT_BY_MIME[mime]);
    await storage().put(key, buf, mime);
    await db.update(companySettings).set({ logoStorageKey: key, logoMime: mime, updatedBy: user.id, updatedAt: new Date() }).where(eq(companySettings.id, 1));
    if (current.logoStorageKey) await storage().delete([current.logoStorageKey]).catch(() => {});
    await audit({ user, action: "settings.logo_updated", entityType: "settings" });
    revalidatePath("/", "layout");
  });
}

export async function removeLogoAction() {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const current = await getSettings();
    if (current.logoStorageKey) await storage().delete([current.logoStorageKey]).catch(() => {});
    await db.update(companySettings).set({ logoStorageKey: null, logoMime: null, updatedBy: user.id, updatedAt: new Date() }).where(eq(companySettings.id, 1));
    await audit({ user, action: "settings.logo_updated", entityType: "settings", details: { removido: true } });
    revalidatePath("/", "layout");
  });
}

export async function setExternalAiAction(enabled: boolean) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    await db
      .update(companySettings)
      .set({ externalAiEnabled: enabled, externalAiEnabledBy: enabled ? user.id : null, externalAiEnabledAt: enabled ? new Date() : null })
      .where(eq(companySettings.id, 1));
    await audit({ user, action: "settings.external_ai", entityType: "settings", details: { habilitado: enabled } });
    revalidatePath("/configuracoes");
  });
}

export async function runRetentionAction() {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    return runRetention(user);
  });
}

export async function createUserAction(input: { name: string; email: string; role: Role }) {
  return runAction(async () => {
    const user = await requireUser("users.manage");
    const res = await createUser(input, user);
    revalidatePath("/configuracoes");
    return { temporaryPassword: res.password };
  });
}

export async function updateUserAction(id: string, input: { name?: string; role?: Role; active?: boolean }) {
  return runAction(async () => {
    const user = await requireUser("users.manage");
    await updateUser(id, input, user);
    revalidatePath("/configuracoes");
  });
}

export async function resetPasswordAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("users.manage");
    return { temporaryPassword: await resetUserPassword(id, user) };
  });
}
