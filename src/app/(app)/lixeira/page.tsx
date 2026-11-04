import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common";
import { TrashActions } from "@/components/records/trash-actions";
import { Card } from "@/components/ui/primitives";
import { RECORD_KINDS } from "@/lib/doc-types";
import { recordTitle } from "@/lib/fields";
import { formatDateTimeBR } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { listRecords } from "@/server/services/records";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Lixeira" };

export default async function TrashPage() {
  await requirePageUser("records.delete");
  const settings = await getSettings();
  const items = (
    await Promise.all(
      RECORD_KINDS.map(async (kind) => {
        const res = await listRecords(kind, { archived: true, pageSize: 200 });
        return res.items.map((i) => ({ kind, id: i.row.id, title: recordTitle(kind, i.values), archivedAt: i.row.archivedAt!, isDraft: i.row.isDraft }));
      }),
    )
  )
    .flat()
    .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Lixeira"
        description={`Fichas excluídas ficam aqui por ${settings.trashRetentionDays} dias antes da remoção definitiva (dados, documentos e PDFs).`}
      />
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={Trash2} title="Lixeira vazia" description="Nenhuma ficha excluída." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => {
              const purgeAt = new Date(i.archivedAt.getTime() + settings.trashRetentionDays * 86400000);
              return (
                <li key={`${i.kind}-${i.id}`} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{i.title}</div>
                    <div className="text-xs text-muted">
                      {i.kind === "driver" ? "Motorista" : "Veículo"} · excluído em {formatDateTimeBR(i.archivedAt)} · remoção automática em {formatDateTimeBR(purgeAt)}
                    </div>
                  </div>
                  <TrashActions kind={i.kind} id={i.id} title={i.title} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
