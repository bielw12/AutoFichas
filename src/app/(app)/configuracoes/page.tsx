import type { Metadata } from "next";
import { PageHeader } from "@/components/common";
import { SettingsView } from "@/components/settings/settings-view";
import { can } from "@/lib/permissions";
import { providerStatus } from "@/server/ai/registry";
import { requirePageUser } from "@/server/auth/session";
import { listUsers } from "@/server/services/users";
import { getSettings } from "@/server/services/settings";
import { signedLogoUrl } from "@/server/signed-url";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { tab } = await searchParams;
  const isAdmin = can(user.role, "settings.manage");
  const s = await getSettings();
  const users = can(user.role, "users.manage") ? await listUsers() : [];
  const ai = providerStatus();
  return (
    <>
      <PageHeader eyebrow="Configurações" title={isAdmin ? "Configurações do sistema" : "Minha conta"} description={isAdmin ? "Identidade visual das fichas, integração de IA, usuários e políticas de privacidade." : "Gerencie seu acesso."} />
      <SettingsView
        initialTab={tab ?? (isAdmin ? "empresa" : "conta")}
        isAdmin={isAdmin}
        currentUserId={user.id}
        settings={{
          companyName: s.companyName,
          cnpj: s.cnpj,
          phones: s.phones,
          emails: s.emails,
          website: s.website,
          address: s.address,
          footerText: s.footerText,
          primaryColor: s.primaryColor,
          accentColor: s.accentColor,
          footerOnDocuments: s.footerOnDocuments,
          includeBankPage: s.includeBankPage,
          expiryWarningDays: s.expiryWarningDays,
          draftRetentionDays: s.draftRetentionDays,
          trashRetentionDays: s.trashRetentionDays,
        }}
        logoUrl={s.logoStorageKey ? signedLogoUrl(user.id) : null}
        ai={{ ...ai, externalEnabled: s.externalAiEnabled, externalEnabledAt: s.externalAiEnabledAt?.toISOString() ?? null }}
        users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }))}
        storage={{ driver: process.env.STORAGE_DRIVER ?? "local", encrypted: !!process.env.STORAGE_ENCRYPTION_KEY, antivirus: !!process.env.CLAMAV_HOST }}
      />
    </>
  );
}
