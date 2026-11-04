"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Wand2 } from "lucide-react";
import { removeDocumentAction, updateRecordAction } from "@/app/actions/records";
import { DocViewer } from "@/components/doc-viewer";
import { Button } from "@/components/ui/button";
import { Checkbox, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/overlays";
import { Badge, Card } from "@/components/ui/primitives";
import { DocSlot, type PendingUpload } from "@/components/wizard/doc-slot";
import { streamProcessing, uploadFile, type PublicDocument } from "@/components/wizard/client-api";
import type { AiStatusInfo } from "@/components/wizard/record-wizard";
import { DOC_ORDER, DOC_TYPES, type DocType, type RecordKind } from "@/lib/doc-types";
import type { ExtractionSummary } from "@/lib/extraction-types";
import { STATUS_STYLE } from "@/lib/field-meta";
import { fieldDef, fieldLabel } from "@/lib/fields";
import { formatValue } from "@/lib/display";
import { buildProposals, diffProposals, type ProposalDiff } from "@/lib/merge";
import type { RecordEditorState } from "@/server/views";
import type { DetailPerms } from "./record-detail";

export function DocumentsPanel({ kind, state, perms, ai }: { kind: RecordKind; state: RecordEditorState; perms: DetailPerms; ai: AiStatusInfo }) {
  const router = useRouter();
  const [docs, setDocs] = useState<PublicDocument[]>(state.documents);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [viewing, setViewing] = useState<PublicDocument | null>(null);
  const [toRemove, setToRemove] = useState<PublicDocument | null>(null);
  const [processing, setProcessing] = useState<DocType | null>(null);
  const [diffs, setDiffs] = useState<{ docType: DocType; items: ProposalDiff[]; extraction: ExtractionSummary } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const show = (key: string, v: string) => {
    const def = fieldDef(kind, key);
    return def ? formatValue(def, v) : v;
  };

  const pending = useMemo(() => {
    const out: DocType[] = [];
    for (const t of DOC_ORDER[kind]) {
      if (!DOC_TYPES[t].extractable) continue;
      const ids = docs.filter((d) => d.docType === t).map((d) => d.id);
      if (!ids.length) continue;
      const ex = state.extractions.find((e) => e.docType === t && !e.error);
      if (!ex || ex.documentIds.length !== ids.length || !ids.every((i) => ex.documentIds.includes(i))) out.push(t);
    }
    return out;
  }, [docs, kind, state.extractions]);

  const onFiles = async (docType: DocType, files: File[], replaceId?: string) => {
    for (const file of files) {
      const key = `${docType}-${file.name}-${Date.now()}`;
      setUploads((u) => [...u, { key, docType, name: file.name, size: file.size, mime: file.type, progress: 0, replaceId }]);
      try {
        const doc = await uploadFile(kind, state.id, docType, file, {
          replaceId,
          onProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))),
        });
        setDocs((d) => {
          const replaced = replaceId ?? (!DOC_TYPES[docType].multiple ? d.find((x) => x.docType === docType)?.id : undefined);
          return [...d.filter((x) => x.id !== replaced), doc];
        });
        setUploads((u) => u.filter((x) => x.key !== key));
        toast.success(replaceId ? "Documento substituído. Os demais dados foram preservados." : "Documento adicionado.", {
          description: DOC_TYPES[docType].extractable && perms.process ? "Você pode reprocessar este documento com IA para atualizar os campos correspondentes." : undefined,
        });
        router.refresh();
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: (err as Error).message } : x)));
      }
    }
  };

  const reprocess = async (docType: DocType) => {
    setProcessing(docType);
    let result: ExtractionSummary[] | null = null;
    let error: string | null = null;
    try {
      await streamProcessing(kind, state.id, [docType], (e) => {
        if (e.type === "done") result = e.extractions;
        if (e.type === "error") error = e.message;
        if (e.type === "doc_error") toast.warning(e.message);
      });
    } catch (err) {
      error = (err as Error).message;
    }
    setProcessing(null);
    if (error || !result) return toast.error(error ?? "Falha no processamento.");
    const latest = result as ExtractionSummary[];
    const ex = latest.find((e) => e.docType === docType)!;
    const proposals = buildProposals(kind, latest);
    // Somente campos cuja origem é o documento reprocessado
    const scoped = Object.fromEntries(Object.entries(proposals).filter(([, p]) => p.meta.source?.docType === docType));
    const items = diffProposals(state.values, scoped);
    if (!items.length) {
      toast.success("Documento reprocessado. Nenhuma divergência com os dados atuais.");
      router.refresh();
      return;
    }
    await updateRecordAction(kind, state.id, {}, { reviewPending: true, regenerate: false });
    setDiffs({ docType, items, extraction: ex });
    // Por padrão não sobrescreve o que o usuário corrigiu/conferiu manualmente
    setSelected(items.filter((i) => i.meta.status !== "conflict" && !["manual", "confirmed"].includes(state.meta[i.key]?.status ?? "")).map((i) => i.key));
  };

  const apply = async (keys: string[]) => {
    if (!diffs) return;
    setApplying(true);
    const changes = Object.fromEntries(diffs.items.filter((i) => keys.includes(i.key)).map((i) => [i.key, i.proposed]));
    const meta = Object.fromEntries(diffs.items.filter((i) => keys.includes(i.key)).map((i) => [i.key, i.meta]));
    const res = await updateRecordAction(kind, state.id, changes, {
      meta,
      reviewPending: false,
      regenerate: keys.length > 0,
      reason: `Reprocessamento: ${DOC_TYPES[diffs.docType].shortLabel}`,
    });
    setApplying(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(keys.length ? `${keys.length} campo(s) atualizado(s). Demais dados preservados.` : "Sugestões descartadas. Dados mantidos.");
    setDiffs(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {pending.length > 0 && perms.process && (
        <Card className="flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50/60 px-5 py-3.5">
          <Bot className="size-5 text-brand-600" />
          <span className="mr-auto text-sm">
            Documentos novos ou substituídos ainda não processados: <strong>{pending.map((t) => DOC_TYPES[t].shortLabel).join(", ")}</strong>.
          </span>
          {pending.map((t) => (
            <Button key={t} size="sm" onClick={() => reprocess(t)} disabled={!!processing || !ai.configured} title={!ai.configured ? ai.message : undefined}>
              {processing === t ? <Loader2 className="animate-spin" /> : <Wand2 />} Reprocessar {DOC_TYPES[t].shortLabel}
            </Button>
          ))}
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {DOC_ORDER[kind].map((t) => {
          const list = docs.filter((d) => d.docType === t);
          const ex = state.extractions.find((e) => e.docType === t);
          return (
            <div key={t} className="space-y-2">
              {perms.upload ? (
                <DocSlot
                  docType={t}
                  docs={list}
                  uploads={uploads.filter((u) => u.docType === t)}
                  onFiles={(files, replaceId) => onFiles(t, files, replaceId)}
                  onRemove={(d) => setToRemove(d)}
                  onView={(d) => setViewing(d)}
                  onDismissUpload={(key) => setUploads((u) => u.filter((x) => x.key !== key))}
                  disabled={!!processing}
                />
              ) : (
                <Card className="p-5">
                  <h3 className="font-bold">{DOC_TYPES[t].label}</h3>
                  {list.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Nenhum arquivo.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {list.map((d) => (
                        <li key={d.id}>
                          <button className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => setViewing(d)}>
                            {d.originalName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              {ex && DOC_TYPES[t].extractable && list.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted">
                  <Bot className="size-3.5" /> Último processamento: {new Date(ex.createdAt).toLocaleString("pt-BR")} · {ex.provider}
                  {ex.error ? <Badge tone="red">Falhou</Badge> : ex.legibility === "ilegivel" ? <Badge tone="red">Ilegível</Badge> : null}
                  {perms.process && ai.configured && !pending.includes(t) && (
                    <button className="font-semibold text-brand-600 hover:underline disabled:opacity-50" disabled={!!processing} onClick={() => reprocess(t)}>
                      {processing === t ? "Processando…" : "Processar novamente"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent wide className="h-[88vh] p-3 pt-12">
          <DialogTitle className="absolute left-5 top-4">{viewing ? DOC_TYPES[viewing.docType].shortLabel : ""}</DialogTitle>
          {viewing && <DocViewer docs={[viewing]} className="h-full" />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remover este documento?"
        description="O arquivo deixará de ser anexado à ficha. Ele permanece no histórico até o prazo de retenção. Os dados já conferidos não serão alterados."
        confirmLabel="Remover"
        tone="danger"
        onConfirm={async () => {
          if (!toRemove) return;
          const res = await removeDocumentAction(kind, state.id, toRemove.id);
          if (!res.ok) return toast.error(res.error);
          setDocs((d) => d.filter((x) => x.id !== toRemove.id));
          setToRemove(null);
          toast.success("Documento removido.");
          router.refresh();
        }}
      />

      <Dialog open={!!diffs} onOpenChange={(o) => !o && !applying && setDiffs(null)}>
        <DialogContent wide>
          <DialogTitle>Sugestões do documento reprocessado</DialogTitle>
          <DialogDescription>
            {diffs && DOC_TYPES[diffs.docType].shortLabel}: selecione quais campos devem ser atualizados. Campos não selecionados e os demais dados da ficha serão preservados.
          </DialogDescription>
          {diffs && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-canvas text-left text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2">Campo</th>
                    <th className="px-3 py-2">Valor atual</th>
                    <th className="px-3 py-2">Sugestão</th>
                    <th className="px-3 py-2">Confiança</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {diffs.items.map((i) => (
                    <tr key={i.key}>
                      <td className="px-3 py-2">
                        <Checkbox checked={selected.includes(i.key)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, i.key] : s.filter((x) => x !== i.key)))} aria-label={`Aplicar ${fieldLabel(kind, i.key)}`} />
                      </td>
                      <td className="px-3 py-2 font-semibold">{fieldLabel(kind, i.key)}</td>
                      <td className="px-3 py-2 text-muted">{show(i.key, i.current) || "—"}</td>
                      <td className="px-3 py-2 font-semibold">{show(i.key, i.proposed)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_STYLE[i.meta.status].tone}>{STATUS_STYLE[i.meta.status].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => apply([])} disabled={applying}>
              Manter dados atuais
            </Button>
            <Button onClick={() => apply(selected)} loading={applying} disabled={!selected.length}>
              Aplicar {selected.length} selecionado(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
