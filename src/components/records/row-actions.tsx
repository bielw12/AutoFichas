"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { archiveRecordAction } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { KIND_LABELS, type RecordKind } from "@/lib/doc-types";

export function RowActions({ kind, id, title, pdfUrl, canEdit, canDelete }: { kind: RecordKind; id: string; title: string; pdfUrl: string | null; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const base = `/${KIND_LABELS[kind].slug}/${id}`;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Ações para ${title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <Link href={base}>
              <Eye /> Visualizar
            </Link>
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link href={`${base}?tab=editar`}>
                <Pencil /> Editar
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild disabled={!pdfUrl}>
            <a href={pdfUrl ?? "#"}>
              <Download /> Baixar PDF
            </a>
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => setConfirm(true)}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Excluir a ficha de ${title}?`}
        description="A ficha e seus documentos serão movidos para a lixeira administrativa e removidos definitivamente após o prazo de retenção. Um administrador pode restaurá-la antes disso."
        confirmLabel="Mover para a lixeira"
        tone="danger"
        loading={loading}
        onConfirm={async () => {
          setLoading(true);
          const res = await archiveRecordAction(kind, id);
          setLoading(false);
          setConfirm(false);
          if (!res.ok) return toast.error(res.error);
          toast.success("Ficha movida para a lixeira.");
          router.refresh();
        }}
      />
    </>
  );
}
