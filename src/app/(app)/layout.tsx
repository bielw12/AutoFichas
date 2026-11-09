import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/server/auth/session";
import { authDisabled } from "@/server/env";
import { getSettings, isSettingsConfigured } from "@/server/services/settings";
import { signedLogoUrl } from "@/server/signed-url";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const settings = await getSettings();
  return (
    <AppShell
      user={user}
      authDisabled={authDisabled()}
      company={{ name: settings.companyName, configured: isSettingsConfigured(settings), logoUrl: settings.logoStorageKey ? signedLogoUrl(user.id) : null }}
    >
      {children}
    </AppShell>
  );
}
