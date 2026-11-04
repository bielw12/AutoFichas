"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import { purgeRecordAction, restoreRecordAction } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Input } from "@/components/ui/primitives";
import type { RecordKind } from "@/lib/doc-types";

export function TrashActions({ kind, id, title }: { kind: RecordKind; id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          const res = await restoreRecordAction(kind, id);
          if (!res.ok) return toast.error(res.error);
          toast.success("Ficha restaurada.");
          router.refresh();
        }}
      >
        <RotateCcw /> Restaurar
      </Button>
      <Button variant="danger-ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 /> Excluir definitivamente
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setText("");
        }}
        title={`Excluir definitivamente "${title}"?`}
        description="Os dados, todas as versões, os documentos originais e os PDFs gerados serão apagados. Esta ação não pode ser desfeita."
        confirmLabel="Excluir definitivamente"
        tone="danger"
        loading={loading}
        onConfirm={async () => {
          setLoading(true);
          const res = await purgeRecordAction(kind, id, text);
          setLoading(false);
          if (!res.ok) return toast.error(res.error);
          setOpen(false);
          toast.success(`Excluído definitivamente (${res.data.files} arquivo(s) removido(s)).`);
          router.refresh();
        }}
      >
        <div className="mt-4">
          <label className="text-sm text-ink-soft">
            Digite <strong>EXCLUIR</strong> para confirmar:
          </label>
          <Input className="mt-1.5" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </div>
      </ConfirmDialog>
    </div>
  );
}
