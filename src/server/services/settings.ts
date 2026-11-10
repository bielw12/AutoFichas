import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db";
import { companySettings, type CompanySettings } from "../db/schema";
import { storage } from "../storage";

/** Leitura sem cache (para uso logo após alterar as configurações na mesma requisição). */
export async function readSettingsFresh(): Promise<CompanySettings> {
  const rows = await db.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1);
  return rows[0] ?? (await getSettings());
}

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

/** Dados exibidos na página "Dados bancários" da ficha. */
export interface BankPageData {
  titularNome: string;
  titularDocumento: string;
  vinculo?: string;
  bancoNome: string;
  bancoCodigo: string;
  agencia: string;
  conta: string;
  contaDigito: string;
  contaTipo: string;
  pixTipo: string;
  pixChave: string;
}

export function companyBankData(s: CompanySettings): BankPageData {
  return {
    titularNome: s.bankHolderName,
    titularDocumento: s.bankHolderDocument,
    bancoNome: s.bankName,
    bancoCodigo: s.bankCode,
    agencia: s.bankAgency,
    conta: s.bankAccount,
    contaDigito: s.bankAccountDigit,
    contaTipo: s.bankAccountType,
    pixTipo: s.bankPixType,
    pixChave: s.bankPixKey,
  };
}

export function hasCompanyBank(s: CompanySettings): boolean {
  return !!(s.bankName.trim() || s.bankAccount.trim() || s.bankPixKey.trim());
}

/** A ficha usa os dados bancários padrão da transportadora (e o documento bancário do motorista fica opcional). */
export function companyBankActive(s: CompanySettings): boolean {
  return s.bankSource !== "motorista" && hasCompanyBank(s);
}
