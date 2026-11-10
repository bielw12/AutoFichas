"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Download,
  ExternalLink,
  FileCheck2,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { checkDuplicatesAction, createDraftAction, discardDraftAction, finalizeRecordAction, getEditorStateAction, removeDocumentAction, saveDraftAction } from "@/app/actions/records";
import { DocViewer } from "@/components/doc-viewer";
import { ConfidenceLegend, RecordForm } from "@/components/record-form";
import { Button } from "@/components/ui/button";
import { Checkbox, ConfirmDialog, Dialog, DialogContent, DialogTitle } from "@/components/ui/overlays";
import { Card } from "@/components/ui/primitives";
import { COMPANY_BANK_DOC_HINT, COMPANY_BANK_SECTION_NOTE, DOC_ORDER, DOC_TYPES, isDocRequired, KIND_LABELS, requiredDocs, type DocType, type RecordKind } from "@/lib/doc-types";
import type { ExtractionSummary, ProcessEvent } from "@/lib/extraction-types";
import type { FieldMetaMap } from "@/lib/field-meta";
import { DUPLICATE_KEYS, emptyValues, FIELDS, fieldDef, fieldLabel, type FormValues } from "@/lib/fields";
import { displayValue, formErrors, toDisplayValues } from "@/lib/form-display";
import { detectInconsistencies, unresolvedErrors, type Inconsistency } from "@/lib/inconsistencies";
import { applyProposals, buildProposals } from "@/lib/merge";
import { normalizeInput } from "@/lib/normalize";
import { missingRequiredFields } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { RecordEditorState } from "@/server/views";
import { generatePdf, streamProcessing, uploadFile, type PublicDocument } from "./client-api";
import { DocSlot, type PendingUpload } from "./doc-slot";

export interface AiStatusInfo {
  configured: boolean;
  label: string;
  message: string;
  external: boolean;
  externalEnabled: boolean;
}

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Documentos", "Processamento", "Conferência", "Prévia e geração"];

type DocStage = "aguardando" | "preparando" | "analisando" | "validando" | "concluido" | "erro";
interface ProcState {
  phase: "idle" | "running" | "done" | "blocked" | "failed";
  docTypes: DocType[];
  stages: Partial<Record<DocType, DocStage>>;
  errors: Partial<Record<DocType, string>>;
  organizing: boolean;
  finalizing: boolean;
  message?: string;
  code?: string;
}

const STAGE_LABEL: Record<DocStage, string> = {
  aguardando: "Na fila",
  preparando: "Preparando arquivo",
  analisando: "Identificando e extraindo informações",
  validando: "Validando dados extraídos",
  concluido: "Concluído",
  erro: "Requer atenção",
};

function normalizedValues(kind: RecordKind, values: FormValues): FormValues {
  const out: FormValues = {};
  for (const f of FIELDS[kind]) out[f.key] = normalizeInput(f.input, values[f.key] ?? "");
  return out;
}

function pendingTypes(docs: PublicDocument[], extractions: ExtractionSummary[]): DocType[] {
  const byType = new Map<DocType, string[]>();
  for (const d of docs) {
    if (!DOC_TYPES[d.docType].extractable) continue;
    byType.set(d.docType, [...(byType.get(d.docType) ?? []), d.id]);
  }
  const out: DocType[] = [];
  for (const [t, ids] of byType) {
    const ex = extractions.find((e) => e.docType === t && !e.error);
    if (!ex || ex.documentIds.length !== ids.length || !ids.every((i) => ex.documentIds.includes(i))) out.push(t);
  }
  return out;
}

export function RecordWizard({
  kind,
  initial,
  ai,
  canSaveIncomplete,
  maxUploadMb,
  companyBank = false,
}: {
  /** Dados bancários padrão da transportadora em uso (Configurações). */
  companyBank?: boolean;
  kind: RecordKind;
  initial: RecordEditorState | null;
  ai: AiStatusInfo;
  canSaveIncomplete: boolean;
  maxUploadMb: number;
}) {
  const router = useRouter();
  const labels = KIND_LABELS[kind];
  const [recordId, setRecordId] = useState<string | null>(initial?.id ?? null);
  const [docs, setDocs] = useState<PublicDocument[]>(initial?.documents ?? []);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [extractions, setExtractions] = useState<ExtractionSummary[]>(initial?.extractions ?? []);
  const [values, setValues] = useState<FormValues>(() => toDisplayValues(kind, initial?.values ?? emptyValues(kind)));
  const [meta, setMeta] = useState<FieldMetaMap>(initial?.meta ?? {});
  const [ack, setAck] = useState<string[]>(initial?.acknowledged ?? []);
  const [step, setStep] = useState<Step>(() => (initial && (initial.extractions.length || Object.values(initial.values).some(Boolean)) ? 2 : 0));
  const [proc, setProc] = useState<ProcState>({ phase: "idle", docTypes: [], stages: {}, errors: {}, organizing: false, finalizing: false });
  const [preview, setPreview] = useState<{ url: string; downloadUrl: string; pageCount: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dups, setDups] = useState<{ id: string; title: string; label: string }[]>([]);
  const [viewer, setViewer] = useState<{ docType?: DocType; docId?: string }>({});
  const [viewDialog, setViewDialog] = useState<PublicDocument | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftPromise = useRef<Promise<string> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ------------------------------------------------------------ Rascunho
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (recordId) return recordId;
    if (!draftPromise.current) {
      draftPromise.current = createDraftAction(kind).then((r) => {
        if (!r.ok) {
          draftPromise.current = null;
          throw new Error(r.error);
        }
        setRecordId(r.data.id);
        window.history.replaceState(null, "", `?id=${r.data.id}`);
        return r.data.id;
      });
    }
    return draftPromise.current;
  }, [kind, recordId]);

  const persistDraft = useCallback(
    async (v = values, m = meta, a = ack) => {
      if (!recordId) return true;
      const res = await saveDraftAction(kind, recordId, v, m, a);
      if (!res.ok) {
        toast.error(res.error, { description: res.details ? Object.entries(res.details as Record<string, string>).map(([k, e]) => `${fieldLabel(kind, k)}: ${e}`).join(" · ") : undefined });
        return false;
      }
      return true;
    },
    [kind, recordId, values, meta, ack],
  );

  // -------------------------------------------------------------- Upload
  const onFiles = async (docType: DocType, files: File[], replaceId?: string) => {
    let id: string;
    try {
      id = await ensureRecord();
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }
    for (const file of files) {
      const key = `${docType}-${file.name}-${Date.now()}-${Math.random()}`;
      const base: PendingUpload = { key, docType, name: file.name, size: file.size, mime: file.type, progress: 0, replaceId };
      if (file.size > maxUploadMb * 1024 * 1024) {
        setUploads((u) => [...u, { ...base, error: `Excede ${maxUploadMb} MB` }]);
        continue;
      }
      setUploads((u) => [...u, base]);
      try {
        const doc = await uploadFile(kind, id, docType, file, {
          replaceId,
          onProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))),
        });
        setDocs((d) => {
          const replaced = replaceId ?? (!DOC_TYPES[docType].multiple ? d.find((x) => x.docType === docType)?.id : undefined);
          return [...d.filter((x) => x.id !== replaced), doc];
        });
        setUploads((u) => u.filter((x) => x.key !== key));
        setPreview(null);
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: (err as Error).message } : x)));
      }
    }
  };

  const onRemove = async (doc: PublicDocument) => {
    if (!recordId) return;
    const res = await removeDocumentAction(kind, recordId, doc.id);
    if (!res.ok) return toast.error(res.error);
    setDocs((d) => d.filter((x) => x.id !== doc.id));
    setPreview(null);
    toast.success("Arquivo removido.");
  };

  const missingDocs = requiredDocs(kind, { companyBank }).filter((t) => !docs.some((d) => d.docType === t));
  const uploading = uploads.some((u) => !u.error);
  const pending = useMemo(() => pendingTypes(docs, extractions), [docs, extractions]);

  // ---------------------------------------------------------- Processing
  const runProcessing = async (types?: DocType[]) => {
    if (!recordId) return;
    const target = types ?? pending;
    setStep(1);
    if (!target.length) {
      setProc((p) => ({ ...p, phase: "done" }));
      setStep(2);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProc({ phase: "running", docTypes: target, stages: Object.fromEntries(target.map((t) => [t, "aguardando"])), errors: {}, organizing: false, finalizing: false });

    let finalExtractions: ExtractionSummary[] | null = null;
    let blocked: { code: string; message: string } | null = null;
    const docErrors: Partial<Record<DocType, string>> = {};
    const onEvent = (e: ProcessEvent) => {
      if (e.type === "stage") setProc((p) => ({ ...p, stages: { ...p.stages, [e.docType]: e.stage } }));
      else if (e.type === "doc_error") {
        docErrors[e.docType] = e.message;
        setProc((p) => ({ ...p, errors: { ...p.errors, [e.docType]: e.message } }));
      } else if (e.type === "organizing") setProc((p) => ({ ...p, organizing: true }));
      else if (e.type === "error") blocked = { code: e.code, message: e.message };
      else if (e.type === "done") finalExtractions = e.extractions;
    };
    try {
      await streamProcessing(kind, recordId, target, onEvent, ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setProc((p) => ({ ...p, phase: "failed", message: (err as Error).message }));
      return;
    }
    if (blocked) {
      const b = blocked as { code: string; message: string };
      setProc((p) => ({ ...p, phase: "blocked", code: b.code, message: b.message }));
      return;
    }
    if (!finalExtractions) {
      setProc((p) => ({ ...p, phase: "failed", message: "O processamento foi interrompido. Tente novamente." }));
      return;
    }
    setProc((p) => ({ ...p, finalizing: true }));
    const latest = finalExtractions as ExtractionSummary[];
    const proposals = buildProposals(kind, latest);
    const relevant = Object.fromEntries(Object.entries(proposals).filter(([k, p]) => (p.meta.source && target.includes(p.meta.source.docType)) || !values[k]));
    const display = Object.fromEntries(Object.entries(relevant).map(([k, p]) => [k, { ...p, value: displayValue(kind, k, p.value) }]));
    const merged = applyProposals(values, meta, display);
    setExtractions(latest);
    setValues(merged.values);
    setMeta(merged.meta);
    await persistDraft(merged.values, merged.meta, ack);
    const state = await getEditorStateAction(kind, recordId);
    if (state.ok) setDocs(state.data.documents);
    setProc((p) => ({ ...p, phase: "done", finalizing: false }));
    if (!Object.keys(docErrors).length) {
      toast.success("Documentos processados. Confira os dados sugeridos.");
      setStep(2);
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  // ------------------------------------------------------------- Review
  const norm = useMemo(() => normalizedValues(kind, values), [kind, values]);
  const errors = useMemo(() => formErrors(kind, values), [kind, values]);
  const issues = useMemo(() => detectInconsistencies(kind, norm, extractions), [kind, norm, extractions]);
  const blocking = unresolvedErrors(issues, ack);
  const missingFields = missingRequiredFields(kind, norm, { companyBank });

  const dupKey = DUPLICATE_KEYS[kind].map((d) => norm[d.key]).join("|");
  useEffect(() => {
    if (step < 2 || !dupKey.replace(/\|/g, "")) {
      setDups([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await checkDuplicatesAction(kind, norm, recordId ?? undefined);
      if (res.ok) setDups(res.data);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey, step, kind, recordId]);

  const onChange = (key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    setMeta((m) => (m[key] ? { ...m, [key]: { ...m[key], status: "manual" } } : { ...m, [key]: { status: "manual" } }));
    setPreview(null);
  };
  const onConfirm = (key: string) => setMeta((m) => ({ ...m, [key]: { ...m[key], status: "confirmed" } }));
  const onFocusField = (key: string) => {
    const src = meta[key]?.source?.docType ?? fieldDef(kind, key)?.sources?.[0]?.docType;
    if (src) setViewer({ docType: src, docId: meta[key]?.source?.documentIds?.[0] });
  };

  const viewerDocs = viewer.docType ? docs.filter((d) => d.docType === viewer.docType) : docs.filter((d) => DOC_TYPES[d.docType].extractable);
  const reviewCounts = useMemo(() => {
    const c = { high: 0, review: 0, red: 0 };
    for (const f of FIELDS[kind]) {
      const s = meta[f.key]?.status;
      if (s === "high" || s === "confirmed") c.high++;
      else if (s === "review") c.review++;
      else if (s === "missing" || s === "conflict") c.red++;
    }
    return c;
  }, [kind, meta]);

  // ------------------------------------------------------------ Preview
  const goPreview = async () => {
    if (Object.keys(errors).length) {
      toast.error("Corrija os campos com formato inválido antes de continuar.");
      document.getElementById(`f-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    if (!recordId) return;
    setPreviewLoading(true);
    setStep(3);
    if (!(await persistDraft())) {
      setPreviewLoading(false);
      setStep(2);
      return;
    }
    try {
      setPreview(await generatePdf(kind, recordId));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const finalize = async (force = false) => {
    if (!recordId) return;
    if (blocking.length) return toast.error("Resolva ou confirme as inconsistências destacadas antes de salvar.");
    if (dups.length) return toast.error("Já existe cadastro com o mesmo identificador.");
    if (missingFields.length && !force) return setConfirmIncomplete(true);
    setSaving(true);
    const res = await finalizeRecordAction(kind, recordId, values, meta, ack, { allowMissingDocs: canSaveIncomplete });
    setSaving(false);
    setConfirmIncomplete(false);
    if (!res.ok) {
      if (res.code === "duplicate") setDups((res.details as typeof dups) ?? []);
      return toast.error(res.error);
    }
    toast.success("Ficha salva com sucesso!", { description: `Versão ${res.data.version} gerada com os documentos anexados.` });
    router.push(`/${labels.slug}/${recordId}`);
    router.refresh();
  };

  const discard = async () => {
    if (!recordId) {
      router.push("/nova-ficha");
      return;
    }
    const res = await discardDraftAction(kind, recordId);
    if (!res.ok) return toast.error(res.error);
    toast.success("Rascunho descartado.");
    router.push("/nova-ficha");
  };

  const goToStep = async (s: Step) => {
    if (s === step) return;
    if (step === 2) await persistDraft();
    if (s === 3) return goPreview();
    if (s === 1) return runProcessing();
    setStep(s);
  };

  const canAdvanceFromDocs = !uploading && (missingDocs.length === 0 || canSaveIncomplete) && docs.length > 0;

  // ================================================================ UI
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/nova-ficha" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <ArrowLeft className="size-3.5" /> Nova ficha
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-[28px]">Cadastro de {labels.singular.toLowerCase()}</h1>
        </div>
        <div className="flex gap-2">
          {recordId && (
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
              <Trash2 /> Descartar
            </Button>
          )}
          {recordId && step === 2 && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (await persistDraft()) toast.success("Rascunho salvo.");
              }}
            >
              <Save /> Salvar rascunho
            </Button>
          )}
        </div>
      </div>

      {/* Indicador de etapas */}
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Etapas do cadastro">
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          const clickable = i < step || (i === 2 && extractions.length > 0) || (i === 2 && proc.phase === "blocked");
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!clickable || proc.phase === "running"}
                onClick={() => goToStep(i as Step)}
                aria-current={state === "current" ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <div className={cn("h-1.5 rounded-full transition-colors", state === "done" ? "bg-brand-500" : state === "current" ? "bg-sun-400" : "bg-line")} />
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      state === "done" ? "bg-brand-500 text-white" : state === "current" ? "bg-sun-400 text-brand-950" : "bg-line text-muted",
                    )}
                  >
                    {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("hidden text-[13px] font-semibold sm:block", state === "todo" ? "text-muted" : "text-ink", clickable && "group-hover:text-brand-600")}>{label}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* ------------------------------------------------ Etapa 1 */}
      {step === 0 && (
        <div className="space-y-4">
          {!ai.configured && (
            <AiNotice ai={ai} />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {DOC_ORDER[kind].map((t) => (
              <div key={t} className={cn(t === "outro" && "lg:col-span-2")}>
                <DocSlot
                  docType={t}
                  required={isDocRequired(t, { companyBank })}
                  hint={companyBank && t === "dados_bancarios" ? COMPANY_BANK_DOC_HINT : undefined}
                  docs={docs.filter((d) => d.docType === t)}
                  uploads={uploads.filter((u) => u.docType === t)}
                  onFiles={(files, replaceId) => onFiles(t, files, replaceId)}
                  onRemove={onRemove}
                  onView={(d) => setViewDialog(d)}
                  onDismissUpload={(key) => setUploads((u) => u.filter((x) => x.key !== key))}
                />
              </div>
            ))}
          </div>
          <StickyBar>
            <div className="text-sm text-muted">
              {missingDocs.length ? (
                <>
                  Faltam: <span className="font-semibold text-ink">{missingDocs.map((d) => DOC_TYPES[d].shortLabel).join(", ")}</span>
                </>
              ) : (
                <span className="font-semibold text-emerald-700">Todos os documentos obrigatórios foram enviados.</span>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canSaveIncomplete && missingDocs.length > 0 && docs.length > 0 && (
                <Button variant="secondary" disabled={uploading} onClick={() => (pending.length && ai.configured ? runProcessing() : setStep(2))}>
                  Avançar sem todos os documentos
                </Button>
              )}
              <Button size="lg" disabled={!canAdvanceFromDocs || missingDocs.length > 0} onClick={() => (pending.length ? runProcessing() : setStep(2))}>
                  {pending.length || (docs.length === 0 && ai.configured) ? (
                    <>
                      <Wand2 /> Processar documentos
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight />
                    </>
                  )}
                </Button>
            </div>
          </StickyBar>
        </div>
      )}

      {/* ------------------------------------------------ Etapa 2 */}
      {step === 1 && (
        <ProcessingView
          proc={proc}
          ai={ai}
          onRetry={() => runProcessing(proc.docTypes)}
          onReplace={() => setStep(0)}
          onContinue={() => setStep(2)}
          onManual={() => setStep(2)}
        />
      )}

      {/* ------------------------------------------------ Etapa 3 */}
      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
          <div className="min-w-0 space-y-4">
            <Card className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <Bot className="size-5 text-brand-500" />
              <div className="mr-auto text-sm">
                {extractions.length ? (
                  <>
                    <span className="font-bold text-emerald-700">{reviewCounts.high} com alta confiança</span> · <span className="font-bold text-sun-600">{reviewCounts.review} para conferir</span> ·{" "}
                    <span className="font-bold text-red-600">{reviewCounts.red} pendentes</span>
                  </>
                ) : (
                  <span className="text-muted">Preenchimento manual — nenhum documento foi processado pela IA.</span>
                )}
              </div>
              <ConfidenceLegend />
            </Card>
            {pending.length > 0 && ai.configured && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
                <RefreshCw className="size-4 text-brand-600" />
                <span className="mr-auto">Há documentos novos ou substituídos ainda não processados: {pending.map((t) => DOC_TYPES[t].shortLabel).join(", ")}.</span>
                <Button size="sm" onClick={() => runProcessing(pending)}>
                  Processar agora
                </Button>
              </div>
            )}
            <DuplicateAlert dups={dups} kind={kind} />
            <IssuesPanel issues={issues} ack={ack} onToggle={(id, v) => setAck((a) => (v ? [...a, id] : a.filter((x) => x !== id)))} />
            <RecordForm
              kind={kind}
              values={values}
              meta={meta}
              errors={errors}
              onChange={onChange}
              onConfirm={onConfirm}
              onFocusField={onFocusField}
              highlight={issues.filter((i) => i.severity === "error" && !ack.includes(i.id)).flatMap((i) => i.fields)}
              sectionNotes={companyBank ? { bancarios: COMPANY_BANK_SECTION_NOTE } : undefined}
            />
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-6 h-[calc(100dvh-48px)]">
              <DocViewer docs={viewerDocs} activeId={viewer.docId} onSelect={(id) => setViewer((v) => ({ ...v, docId: id }))} emptyText="Nenhum documento enviado para este campo." />
            </div>
          </aside>
          <div className="lg:col-span-2">
            <StickyBar>
              <Button variant="ghost" onClick={() => goToStep(0)}>
                <ArrowLeft /> Documentos
              </Button>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {Object.keys(errors).length > 0 && <span className="text-sm font-medium text-red-600">{Object.keys(errors).length} campo(s) com formato inválido</span>}
                <Button size="lg" onClick={goPreview} disabled={!recordId}>
                  <FileCheck2 /> Gerar ficha
                </Button>
              </div>
            </StickyBar>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Etapa 4 */}
      {step === 3 && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden">
            {previewLoading || !preview ? (
              <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-sm text-muted">
                {previewLoading ? (
                  <>
                    <Loader2 className="size-7 animate-spin text-brand-500" />
                    Gerando a ficha no servidor e anexando os documentos originais…
                  </>
                ) : (
                  <>
                    <XCircle className="size-7 text-red-500" /> Não foi possível gerar a prévia.
                    <Button variant="secondary" onClick={goPreview}>
                      Tentar novamente
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <iframe src={`${preview.url}#view=FitH`} title="Prévia da ficha" className="h-[78vh] w-full border-0" data-testid="pdf-preview" />
            )}
          </Card>
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-bold">Prévia da ficha</h3>
              <p className="mt-1 text-sm text-muted">
                Confira o documento final. {preview ? `${preview.pageCount} páginas: ficha principal seguida dos documentos originais.` : ""}
              </p>
              <div className="mt-4 grid gap-2">
                <Button size="lg" variant="accent" onClick={() => finalize()} loading={saving} disabled={!preview || previewLoading || blocking.length > 0 || dups.length > 0}>
                  <Save /> Salvar ficha
                </Button>
                <Button variant="secondary" onClick={goPreview} disabled={previewLoading}>
                  <RefreshCw /> Gerar PDF novamente
                </Button>
                <Button variant="secondary" asChild disabled={!preview}>
                  <a href={preview?.downloadUrl ?? "#"} aria-disabled={!preview}>
                    <Download /> Baixar PDF
                  </a>
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ArrowLeft /> Voltar para editar
                </Button>
              </div>
            </Card>
            {(blocking.length > 0 || dups.length > 0 || missingFields.length > 0) && (
              <Card className="space-y-2 p-5 text-sm">
                {blocking.length > 0 && (
                  <p className="flex gap-2 text-red-700">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {blocking.length} inconsistência(s) aguardando resolução na etapa de conferência.
                  </p>
                )}
                {dups.length > 0 && (
                  <p className="flex gap-2 text-red-700">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> Já existe cadastro com o mesmo {dups[0].label}.
                  </p>
                )}
                {missingFields.length > 0 && (
                  <p className="flex gap-2 text-orange-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Campos obrigatórios vazios: {missingFields.map((k) => fieldLabel(kind, k)).join(", ")}. A ficha será salva como incompleta.
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!viewDialog} onOpenChange={(o) => !o && setViewDialog(null)}>
        <DialogContent wide className="h-[88vh] p-3 pt-12">
          <DialogTitle className="absolute left-5 top-4">{viewDialog ? DOC_TYPES[viewDialog.docType].shortLabel : ""}</DialogTitle>
          {viewDialog && <DocViewer docs={[viewDialog]} className="h-full" />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Descartar este cadastro?"
        description="O rascunho e os arquivos enviados serão excluídos definitivamente."
        confirmLabel="Descartar"
        tone="danger"
        onConfirm={discard}
      />
      <ConfirmDialog
        open={confirmIncomplete}
        onOpenChange={setConfirmIncomplete}
        title="Salvar ficha incompleta?"
        description={`Os seguintes campos obrigatórios estão vazios: ${missingFields.map((k) => fieldLabel(kind, k)).join(", ")}. A ficha ficará com a situação "Incompleto" até ser complementada.`}
        confirmLabel="Salvar mesmo assim"
        loading={saving}
        onConfirm={() => finalize(true)}
      />
    </div>
  );
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{children}</div>
    </div>
  );
}

function AiNotice({ ai }: { ai: AiStatusInfo }) {
  return (
    <div className="flex gap-3 rounded-xl border border-sun-200 bg-sun-50 px-4 py-3 text-sm">
      <Settings className="mt-0.5 size-4 shrink-0 text-sun-600" />
      <div>
        <div className="font-bold text-ink">Integração de IA não configurada</div>
        <p className="text-ink-soft">{ai.message} Você ainda pode enviar os documentos e preencher a ficha manualmente.</p>
      </div>
    </div>
  );
}

function ProcessingView({
  proc,
  ai,
  onRetry,
  onReplace,
  onContinue,
  onManual,
}: {
  proc: ProcState;
  ai: AiStatusInfo;
  onRetry: () => void;
  onReplace: () => void;
  onContinue: () => void;
  onManual: () => void;
}) {
  if (proc.phase === "blocked") {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sun-50 text-sun-600 ring-1 ring-sun-200">
          <Settings className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold">{proc.code === "external_disabled" ? "Envio a provedor externo não autorizado" : "Integração de IA não configurada"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{proc.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={onManual}>Preencher manualmente</Button>
          <Button variant="secondary" asChild>
            <Link href="/configuracoes?tab=ia">
              <ExternalLink /> Ver configuração de IA
            </Link>
          </Button>
        </div>
      </Card>
    );
  }
  const stages = proc.stages;
  const all = proc.docTypes;
  const reached = (t: DocType, s: DocStage[]) => s.includes(stages[t] ?? "aguardando");
  const anyValidated = all.some((t) => reached(t, ["validando", "concluido", "erro"]));
  const allExtracted = all.length > 0 && all.every((t) => reached(t, ["concluido", "erro"]));
  const top = [
    { label: "Enviando documentos", state: "done" },
    { label: "Identificando documentos", state: anyValidated || allExtracted ? "done" : proc.phase === "running" ? "current" : "todo" },
    { label: "Extraindo informações", state: allExtracted ? "done" : anyValidated ? "current" : "todo" },
    { label: "Organizando dados", state: proc.finalizing || proc.phase === "done" ? "done" : proc.organizing || allExtracted ? "current" : "todo" },
    { label: "Finalizando processamento", state: proc.phase === "done" ? "done" : proc.finalizing ? "current" : "todo" },
  ];
  const hasErrors = Object.keys(proc.errors).length > 0;
  return (
    <Card className="mx-auto max-w-3xl p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          {proc.phase === "running" ? <Loader2 className="size-5 animate-spin" /> : proc.phase === "failed" ? <XCircle className="size-5 text-red-500" /> : <CheckCircle2 className="size-5 text-emerald-600" />}
        </div>
        <div>
          <h2 className="text-lg font-bold">{proc.phase === "running" ? "Lendo seus documentos…" : proc.phase === "failed" ? "Falha no processamento" : hasErrors ? "Processamento concluído com alertas" : "Processamento concluído"}</h2>
          <p className="text-sm text-muted">Provedor: {ai.label}. As informações serão apresentadas como sugestões para sua conferência.</p>
        </div>
      </div>
      {proc.phase === "running" && (
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-brand-50" role="progressbar" aria-label="Processando" aria-busy>
          <div className="af-indeterminate h-full w-1/3 rounded-full bg-gradient-to-r from-brand-400 to-sun-400" />
        </div>
      )}
      <ol className="mt-6 grid gap-2 sm:grid-cols-5">
        {top.map((s) => (
          <li key={s.label} className={cn("rounded-lg border px-3 py-2 text-[12.5px] font-semibold", s.state === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : s.state === "current" ? "border-sun-300 bg-sun-50 text-ink" : "border-line text-muted")}>
            <div className="flex items-center gap-1.5">
              {s.state === "done" ? <Check className="size-3.5" /> : s.state === "current" ? <Loader2 className="size-3.5 animate-spin" /> : <span className="size-3.5" />}
              {s.label}
            </div>
          </li>
        ))}
      </ol>
      <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
        {all.map((t) => {
          const st = stages[t] ?? "aguardando";
          const err = proc.errors[t];
          return (
            <li key={t} className="flex items-center gap-3 px-4 py-3" data-testid={`proc-${t}`}>
              {st === "concluido" ? (
                <CheckCircle2 className="size-5 text-emerald-600" />
              ) : st === "erro" ? (
                <CircleAlert className="size-5 text-red-600" />
              ) : st === "aguardando" ? (
                <span className="size-5 rounded-full border-2 border-line" />
              ) : (
                <Loader2 className="size-5 animate-spin text-brand-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{DOC_TYPES[t].shortLabel}</div>
                <div className={cn("text-xs", err ? "font-medium text-red-600" : "text-muted")}>{err ?? STAGE_LABEL[st]}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {proc.phase === "failed" && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{proc.message}</p>}
      {(proc.phase === "done" || proc.phase === "failed") && (
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {(hasErrors || proc.phase === "failed") && (
            <>
              <Button variant="secondary" onClick={onReplace}>
                Substituir arquivos
              </Button>
              <Button variant="secondary" onClick={onRetry}>
                <RefreshCw /> Processar novamente
              </Button>
            </>
          )}
          <Button onClick={onContinue}>
            Continuar para conferência <ArrowRight />
          </Button>
        </div>
      )}
    </Card>
  );
}

function DuplicateAlert({ dups, kind }: { dups: { id: string; title: string; label: string }[]; kind: RecordKind }) {
  if (!dups.length) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm" role="alert">
      <div className="flex items-center gap-2 font-bold text-red-800">
        <CircleAlert className="size-4" /> Possível cadastro duplicado
      </div>
      <ul className="mt-1.5 space-y-1">
        {dups.map((d) => (
          <li key={d.id} className="text-red-800">
            Já existe uma ficha com o mesmo {d.label}: <strong>{d.title}</strong>.{" "}
            <Link href={`/${KIND_LABELS[kind].slug}/${d.id}`} target="_blank" className="font-semibold underline">
              Abrir cadastro existente
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IssuesPanel({ issues, ack, onToggle }: { issues: Inconsistency[]; ack: string[]; onToggle: (id: string, v: boolean) => void }) {
  if (!issues.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-sun-50/60 px-5 py-3">
        <AlertTriangle className="size-4 text-sun-600" />
        <h3 className="text-sm font-bold">Inconsistências detectadas ({issues.length})</h3>
        <span className="ml-auto text-xs text-muted">Corrija os dados ou marque como conferido</span>
      </div>
      <ul className="divide-y divide-line">
        {issues.map((i) => {
          const done = ack.includes(i.id);
          return (
            <li key={i.id} className={cn("flex items-start gap-3 px-5 py-3", done && "opacity-60")}>
              {i.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sun-500" />}
              <p className="flex-1 text-sm">{i.message}</p>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-ink-soft">
                <Checkbox checked={done} onCheckedChange={(v) => onToggle(i.id, v === true)} aria-label="Marcar como conferido" />
                Conferido
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
