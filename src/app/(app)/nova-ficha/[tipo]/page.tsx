import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RecordWizard } from "@/components/wizard/record-wizard";
import { KIND_LABELS, kindFromSlug } from "@/lib/doc-types";
import { can } from "@/lib/permissions";
import { providerStatus } from "@/server/ai/registry";
import { requirePageUser } from "@/server/auth/session";
import { maxUploadBytes } from "@/server/env";
import { DomainError } from "@/server/services/records";
import { getSettings } from "@/server/services/settings";
import { recordEditorState, type RecordEditorState } from "@/server/views";

export const metadata: Metadata = { title: "Novo cadastro" };

export default async function WizardPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ id?: string }> }) {
  const user = await requirePageUser("records.create");
  const { tipo } = await params;
  const { id } = await searchParams;
  const kind = kindFromSlug(tipo);
  if (!kind) notFound();

  let initial: RecordEditorState | null = null;
  if (id) {
    try {
      initial = await recordEditorState(kind, id, user);
    } catch (err) {
      if (err instanceof DomainError) redirect(`/nova-ficha/${tipo}`);
      throw err;
    }
    if (!initial.isDraft) redirect(`/${KIND_LABELS[kind].slug}/${id}`);
  }

  const st = providerStatus();
  const settings = await getSettings();
  return (
    <RecordWizard
      kind={kind}
      initial={initial}
      canSaveIncomplete={can(user.role, "records.saveIncomplete")}
      maxUploadMb={Math.round(maxUploadBytes() / 1024 / 1024)}
      ai={{ configured: st.configured, label: st.label, message: st.message, external: st.external, externalEnabled: settings.externalAiEnabled }}
    />
  );
}
