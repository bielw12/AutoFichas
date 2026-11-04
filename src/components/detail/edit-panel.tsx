"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { checkDuplicatesAction, updateRecordAction } from "@/app/actions/records";
import { DocViewer } from "@/components/doc-viewer";
import { ConfidenceLegend, RecordForm } from "@/components/record-form";
import { IssuesPanel } from "@/components/wizard/record-wizard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import type { RecordKind } from "@/lib/doc-types";
import type { FieldMetaMap } from "@/lib/field-meta";
import { DUPLICATE_KEYS, FIELDS, fieldDef, type FormValues } from "@/lib/fields";
import { formErrors, toDisplayValues } from "@/lib/form-display";
import { detectInconsistencies, unresolvedErrors } from "@/lib/inconsistencies";
import { normalizeInput } from "@/lib/normalize";
import type { RecordEditorState } from "@/server/views";

/** Edição pontual: altera apenas os campos modificados e gera nova versão. */
export function EditPanel({ kind, state, onSaved }: { kind: RecordKind; state: RecordEditorState; onSaved: () => void }) {
  const router = useRouter();
  const initial = useMemo(() => toDisplayValues(kind, state.values), [kind, state.values]);
  const [values, setValues] = useState<FormValues>(initial);
  const [meta, setMeta] = useState<FieldMetaMap>(state.meta);
  const [ack, setAck] = useState<string[]>(state.acknowledged);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<{ docType?: string; docId?: string }>({});

  const norm = useMemo(() => Object.fromEntries(FIELDS[kind].map((f) => [f.key, normalizeInput(f.input, values[f.key] ?? "")])), [kind, values]);
  const initialNorm = useMemo(() => Object.fromEntries(FIELDS[kind].map((f) => [f.key, normalizeInput(f.input, initial[f.key] ?? "")])), [kind, initial]);
  const changed = FIELDS[kind].map((f) => f.key).filter((k) => norm[k] !== initialNorm[k]);
  const errors = formErrors(kind, values);
  const issues = detectInconsistencies(kind, norm, state.extractions);
  const blocking = unresolvedErrors(issues, ack);
  const ackChanged = JSON.stringify([...ack].sort()) !== JSON.stringify([...state.acknowledged].sort());

  const save = async () => {
    if (Object.keys(errors).length) return toast.error("Corrija os campos com formato inválido.");
    if (blocking.length) return toast.error("Resolva ou marque como conferidas as inconsistências destacadas.");
    if (changed.some((k) => DUPLICATE_KEYS[kind].some((d) => d.key === k))) {
      const dup = await checkDuplicatesAction(kind, norm, state.id);
      if (dup.ok && dup.data.length) return toast.error(`Já existe cadastro com o mesmo ${dup.data[0].label}: ${dup.data[0].title}.`);
    }
    setSaving(true);
    const changes = Object.fromEntries(changed.map((k) => [k, values[k]]));
    const metaPatch = Object.fromEntries(Object.entries(meta).filter(([k, m]) => changed.includes(k) || m !== state.meta[k]));
    const res = await updateRecordAction(kind, state.id, changes, { meta: metaPatch, acknowledged: ack, regenerate: changed.length > 0, reason: "Edição de dados" });
    setSaving(false);
    if (!res.ok) {
      const details = res.details as Record<string, string> | null;
      return toast.error(res.error, { description: details && typeof details === "object" ? Object.values(details).join(" · ") : undefined });
    }
    if (!res.data.changed.length) {
      toast.info(ackChanged ? "Conferências registradas." : "Nenhuma alteração para salvar.");
    } else {
      toast.success(`Alterações salvas (versão ${res.data.version}).`, { description: res.data.pdfVersion ? "O PDF da ficha foi regenerado com os novos dados." : undefined });
    }
    router.refresh();
    onSaved();
  };

  const docs = viewer.docType ? state.documents.filter((d) => d.docType === viewer.docType) : state.documents;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="min-w-0 space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <p className="text-sm text-muted">Altere somente o que precisar — os demais dados são preservados. Ao salvar, uma nova versão é registrada e o PDF é regenerado.</p>
          <ConfidenceLegend />
        </Card>
        <IssuesPanel issues={issues} ack={ack} onToggle={(id, v) => setAck((a) => (v ? [...a, id] : a.filter((x) => x !== id)))} />
        <RecordForm
          kind={kind}
          values={values}
          meta={meta}
          errors={errors}
          onChange={(k, v) => {
            setValues((s) => ({ ...s, [k]: v }));
            setMeta((m) => ({ ...m, [k]: { ...(m[k] ?? {}), status: "manual" } }));
          }}
          onConfirm={(k) => setMeta((m) => ({ ...m, [k]: { ...m[k], status: "confirmed" } }))}
          onFocusField={(k) => {
            const src = meta[k]?.source?.docType ?? fieldDef(kind, k)?.sources?.[0]?.docType;
            if (src) setViewer({ docType: src, docId: meta[k]?.source?.documentIds?.[0] });
          }}
          highlight={blocking.flatMap((i) => i.fields)}
        />
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-6 h-[calc(100dvh-48px)]">
          <DocViewer docs={docs} activeId={viewer.docId} onSelect={(id) => setViewer((v) => ({ ...v, docId: id }))} />
        </div>
      </aside>
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:col-span-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted">{changed.length ? `${changed.length} campo(s) alterado(s)` : "Nenhuma alteração"}</span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={!changed.length}
              onClick={() => {
                setValues(initial);
                setMeta(state.meta);
              }}
            >
              <RotateCcw /> Desfazer
            </Button>
            <Button size="lg" onClick={save} loading={saving} disabled={!changed.length && !ackChanged}>
              <Save /> Salvar alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
