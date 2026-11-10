import { and, desc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { KIND_LABELS, type RecordKind } from "@/lib/doc-types";
import { recordTitle } from "@/lib/fields";
import { can } from "@/lib/permissions";
import { providerStatus } from "@/server/ai/registry";
import { AUDIT_LABELS } from "@/server/audit";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { auditLogs, users } from "@/server/db/schema";
import { getVersions } from "@/server/services/records";
import { companyBankActive, getSettings } from "@/server/services/settings";
import { signedFichaUrl } from "@/server/signed-url";
import { DomainError } from "@/server/services/records";
import { maskForUser, recordEditorState } from "@/server/views";
import { RecordDetail } from "./record-detail";

export async function RecordDetailPage({ kind, id, tab }: { kind: RecordKind; id: string; tab?: string }) {
  const user = await requirePageUser("records.read");
  let state;
  try {
    state = await recordEditorState(kind, id, user);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  if (state.isDraft) redirect(`/nova-ficha/${kind === "driver" ? "motorista" : "veiculo"}?id=${id}`);

  const canEdit = can(user.role, "records.edit");
  const versions = await getVersions(kind, id);
  const userIds = Array.from(new Set(versions.map((v) => v.createdBy).filter(Boolean) as string[]));
  const names = userIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
  const nameOf = (uid: string | null) => names.find((n) => n.id === uid)?.name ?? "Sistema";

  const logs = can(user.role, "audit.read")
    ? await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, kind), eq(auditLogs.entityId, id)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(60)
    : [];

  const settings = await getSettings();
  const st = providerStatus();
  const values = canEdit ? state.values : maskForUser(kind, state.values, user);

  return (
    <RecordDetail
      kind={kind}
      initialTab={tab ?? "visao"}
      title={recordTitle(kind, state.values)}
      state={{ ...state, values }}
      perms={{
        edit: canEdit,
        upload: can(user.role, "documents.upload"),
        process: can(user.role, "ai.process"),
        pdf: can(user.role, "pdf.generate"),
        del: can(user.role, "records.delete"),
        reveal: can(user.role, "sensitive.reveal"),
      }}
      masked={!canEdit}
      companyBank={kind === "driver" && companyBankActive(settings)}
      ai={{ configured: st.configured, label: st.label, message: st.message, external: st.external, externalEnabled: settings.externalAiEnabled }}
      versions={versions.map((v) => ({
        id: v.id,
        version: v.version,
        reason: v.reason,
        changedFields: v.changedFields,
        documentChanges: v.documentChanges,
        createdAt: v.createdAt.toISOString(),
        user: nameOf(v.createdBy),
        pdfUrl: v.pdfStorageKey ? signedFichaUrl(kind, id, user.id, { version: v.version, download: true }) : null,
      }))}
      logs={logs.map((l) => ({
        id: l.id,
        action: AUDIT_LABELS[l.action] ?? l.action,
        user: l.userName ?? "Sistema",
        createdAt: l.createdAt.toISOString(),
        details: l.details as Record<string, unknown>,
      }))}
      listHref={`/${KIND_LABELS[kind].slug}`}
    />
  );
}
