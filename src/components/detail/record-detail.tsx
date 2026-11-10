"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Eye, EyeOff, FileText, FolderOpen, History, LayoutList, Pencil, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { archiveRecordAction, revealSensitiveAction } from "@/app/actions/records";
import { EmptyState, ExpiryBadge, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Badge, Card } from "@/components/ui/primitives";
import type { AiStatusInfo } from "@/components/wizard/record-wizard";
import { generatePdf } from "@/components/wizard/client-api";
import { DOC_TYPES, type RecordKind } from "@/lib/doc-types";
import { formatValue } from "@/lib/display";
import { STATUS_STYLE } from "@/lib/field-meta";
import { FIELDS, fieldLabel, SECTIONS, type FormValues } from "@/lib/fields";
import { formatDateTimeBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecordEditorState } from "@/server/views";
import { DocumentsPanel } from "./documents-panel";
import { EditPanel } from "./edit-panel";

export interface VersionView {
  id: string;
  version: number;
  reason: string | null;
  changedFields: string[];
  documentChanges: { action: string; docType: string; name: string }[];
  createdAt: string;
  user: string;
  pdfUrl: string | null;
}

export interface LogView {
  id: string;
  action: string;
  user: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface DetailPerms {
  edit: boolean;
  upload: boolean;
  process: boolean;
  pdf: boolean;
  del: boolean;
  reveal: boolean;
}

export function RecordDetail({
  kind,
  initialTab,
  title,
  state,
  perms,
  masked,
  ai,
  versions,
  logs,
  listHref,
  companyBank = false,
}: {
  companyBank?: boolean;
  kind: RecordKind;
  initialTab: string;
  title: string;
  state: RecordEditorState;
  perms: DetailPerms;
  masked: boolean;
  ai: AiStatusInfo;
  versions: VersionView[];
  logs: LogView[];
  listHref: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab === "editar" && !perms.edit ? "visao" : initialTab);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdf, setPdf] = useState(state.pdf);

  const changeTab = (t: string) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "visao") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const r = await generatePdf(kind, state.id);
      setPdf({ url: r.url, downloadUrl: r.downloadUrl, generatedAt: new Date().toISOString(), stale: false });
      toast.success(`PDF regenerado (versão ${r.version}, ${r.pageCount} páginas).`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div>
      <Link href={listHref} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> {kind === "driver" ? "Fichas de motoristas" : "Fichas de veículos"}
      </Link>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={state.status} />
            {state.expiries.map((e) => (
              <ExpiryBadge key={e.key} e={e} />
            ))}
            <span className="text-xs text-muted">
              Versão {state.version} · atualizado em {formatDateTimeBR(state.updatedAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pdf && (
            <Button variant="secondary" asChild>
              <a href={pdf.downloadUrl}>
                <Download /> Baixar PDF
              </a>
            </Button>
          )}
          {perms.pdf && (
            <Button variant={pdf?.stale ? "accent" : "secondary"} onClick={regenerate} loading={regenerating}>
              <RefreshCw /> Regenerar PDF
            </Button>
          )}
          {perms.edit && tab !== "editar" && (
            <Button onClick={() => changeTab("editar")}>
              <Pencil /> Editar
            </Button>
          )}
          {perms.del && (
            <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Excluir
            </Button>
          )}
        </div>
      </div>

      {pdf?.stale && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-sun-200 bg-sun-50 px-4 py-2.5 text-sm">
          <TriangleAlert className="size-4 text-sun-600" /> Os dados ou documentos mudaram desde a última geração do PDF.
          {perms.pdf && (
            <button className="font-semibold text-brand-700 underline" onClick={regenerate}>
              Regenerar agora
            </button>
          )}
        </div>
      )}
      {state.reviewPending && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
          <TriangleAlert className="size-4 text-brand-600" /> Há sugestões de um documento reprocessado aguardando conferência na aba Documentos.
        </div>
      )}

      <Tabs value={tab} onValueChange={changeTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="visao">
            <LayoutList /> Dados
          </TabsTrigger>
          {perms.edit && (
            <TabsTrigger value="editar">
              <Pencil /> Editar
            </TabsTrigger>
          )}
          <TabsTrigger value="documentos">
            <FolderOpen /> Documentos <Badge tone="slate">{state.documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pdf">
            <FileText /> Ficha PDF
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="pt-6">
          <Overview kind={kind} id={state.id} values={state.values} meta={state.meta} masked={masked} canReveal={perms.reveal} />
        </TabsContent>
        {perms.edit && (
          <TabsContent value="editar" className="pt-6">
            <EditPanel kind={kind} state={state} companyBank={companyBank} onSaved={() => changeTab("visao")} />
          </TabsContent>
        )}
        <TabsContent value="documentos" className="pt-6">
          <DocumentsPanel kind={kind} state={state} perms={perms} ai={ai} companyBank={companyBank} />
        </TabsContent>
        <TabsContent value="pdf" className="pt-6">
          {pdf ? (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-sm">
                <FileText className="size-4 text-brand-500" />
                <span className="mr-auto">Gerado em {pdf.generatedAt ? formatDateTimeBR(pdf.generatedAt) : "—"}</span>
                <Button size="sm" variant="secondary" asChild>
                  <a href={pdf.url} target="_blank" rel="noopener noreferrer">
                    Abrir em nova aba
                  </a>
                </Button>
              </div>
              <iframe src={`${pdf.url}#view=FitH`} title="Ficha em PDF" className="h-[80vh] w-full border-0" />
            </Card>
          ) : (
            <EmptyState icon={FileText} title="PDF ainda não gerado" action={perms.pdf && <Button onClick={regenerate} loading={regenerating}>Gerar PDF</Button>} />
          )}
        </TabsContent>
        <TabsContent value="historico" className="pt-6">
          <HistoryPanel kind={kind} versions={versions} logs={logs} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir esta ficha?"
        description="A ficha e seus documentos serão movidos para a lixeira administrativa. Eles serão excluídos definitivamente após o prazo de retenção, ou antes, por um administrador."
        confirmLabel="Mover para a lixeira"
        tone="danger"
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          const res = await archiveRecordAction(kind, state.id);
          setDeleting(false);
          if (!res.ok) return toast.error(res.error);
          toast.success("Ficha movida para a lixeira.");
          router.push(listHref);
        }}
      />
    </div>
  );
}

function Overview({ kind, id, values, meta, masked, canReveal }: { kind: RecordKind; id: string; values: FormValues; meta: RecordEditorState["meta"]; masked: boolean; canReveal: boolean }) {
  const hasSensitive = FIELDS[kind].some((f) => f.sensitive && values[f.key]);
  const [revealed, setRevealed] = useState<FormValues | null>(null);
  const [loading, setLoading] = useState(false);
  const shown = (key: string) => {
    const def = FIELDS[kind].find((f) => f.key === key)!;
    if (def.sensitive && !revealed && !masked) {
      const v = values[key];
      return v ? "•••••• (oculto)" : "";
    }
    const v = revealed?.[key] ?? values[key];
    return masked && def.sensitive ? v : formatValue(def, v);
  };
  return (
    <div className="space-y-4">
      {hasSensitive && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-muted">
          <span>Dados pessoais e bancários ficam ocultos por padrão (LGPD).</span>
          {canReveal && !masked && (
            <Button
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={async () => {
                if (revealed) return setRevealed(null);
                setLoading(true);
                const res = await revealSensitiveAction(kind, id);
                setLoading(false);
                if (!res.ok) return toast.error(res.error);
                setRevealed(res.data);
              }}
            >
              {revealed ? <EyeOff /> : <Eye />} {revealed ? "Ocultar dados" : "Mostrar dados sensíveis"}
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {SECTIONS[kind].map((s) => {
          const fields = FIELDS[kind].filter((f) => f.section === s.id);
          if (s.id === "observacoes") {
            return (
              <Card key={s.id} className="p-5 xl:col-span-2">
                <SectionTitle>{s.title}</SectionTitle>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{values.observacoes || <span className="text-muted">Nenhuma observação.</span>}</p>
              </Card>
            );
          }
          return (
            <Card key={s.id} className="p-5">
              <SectionTitle>{s.title}</SectionTitle>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const v = shown(f.key);
                  const m = meta[f.key];
                  return (
                    <div key={f.key} className={cn(f.wide && "sm:col-span-2")}>
                      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        {f.label}
                        {m && (m.status === "review" || m.status === "conflict" || m.status === "missing") && (
                          <span className={cn("size-1.5 rounded-full", m.status === "review" ? "bg-sun-400" : "bg-red-500")} title={STATUS_STYLE[m.status].label} />
                        )}
                      </dt>
                      <dd className={cn("mt-0.5 text-sm font-medium break-words", !v && "text-muted/70 font-normal", ["cpf", "cpf_cnpj", "placa", "renavam", "chassi"].includes(f.input) && "font-mono text-[13px]")}>{v || "Não informado"}</dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-brand-800">
      <span className="h-3.5 w-1 rounded-full bg-sun-400" /> {children}
    </h3>
  );
}

function HistoryPanel({ kind, versions, logs }: { kind: RecordKind; versions: VersionView[]; logs: LogView[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <div className="border-b border-line px-5 py-3.5">
          <h3 className="font-bold">Versões da ficha</h3>
          <p className="text-xs text-muted">Cada alteração de dados ou documentos gera uma nova versão. PDFs anteriores ficam disponíveis.</p>
        </div>
        <ol className="relative px-5 py-4">
          {versions.map((v, i) => (
            <li key={v.id} className="relative pb-5 pl-7 last:pb-0">
              {i < versions.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-line" />}
              <span className={cn("absolute left-0 top-0.5 flex size-[19px] items-center justify-center rounded-full text-[10px] font-bold", i === 0 ? "bg-sun-400 text-brand-950" : "bg-brand-100 text-brand-700")}>{v.version}</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{v.reason ?? "Alteração"}</span>
                <span className="text-xs text-muted">
                  {formatDateTimeBR(v.createdAt)} · {v.user}
                </span>
                {v.pdfUrl && (
                  <a href={v.pdfUrl} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                    <Download className="size-3.5" /> PDF v{v.version}
                  </a>
                )}
              </div>
              {v.changedFields.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {v.changedFields.slice(0, 18).map((f) => (
                    <Badge key={f} tone="blue">
                      {fieldLabel(kind, f)}
                    </Badge>
                  ))}
                  {v.changedFields.length > 18 && <Badge>+{v.changedFields.length - 18}</Badge>}
                </div>
              )}
              {v.documentChanges.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
                  {v.documentChanges.map((d, j) => (
                    <li key={j}>
                      Documento {d.action}: <strong>{DOC_TYPES[d.docType as keyof typeof DOC_TYPES]?.shortLabel ?? d.docType}</strong> — {d.name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <Card>
        <div className="border-b border-line px-5 py-3.5">
          <h3 className="font-bold">Registro de atividades</h3>
          <p className="text-xs text-muted">Operações registradas sem conteúdo sensível.</p>
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Disponível para administradores.</p>
        ) : (
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto scrollbar-thin">
            {logs.map((l) => (
              <li key={l.id} className="px-5 py-2.5 text-sm">
                <div className="font-semibold">{l.action}</div>
                <div className="text-xs text-muted">
                  {l.user} · {formatDateTimeBR(l.createdAt)}
                  {typeof l.details.tipo === "string" ? ` · ${DOC_TYPES[l.details.tipo as keyof typeof DOC_TYPES]?.shortLabel ?? l.details.tipo}` : ""}
                  {Array.isArray(l.details.campos) && l.details.campos.length ? ` · ${(l.details.campos as string[]).map((c) => fieldLabel(kind, c)).join(", ")}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
