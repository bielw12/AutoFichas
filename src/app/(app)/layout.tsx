import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/server/auth/session";
import { getSettings, isSettingsConfigured } from "@/server/services/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const settings = await getSettings();
  return (
    <AppShell user={user} company={{ name: settings.companyName, configured: isSettingsConfigured(settings) }}>
      {children}
    </AppShell>
  );
}
