"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, FileImage, FileText, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlays";
import { ACCEPT_ATTR, ACCEPT_IMAGES_ATTR, DOC_TYPES, type DocType } from "@/lib/doc-types";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicDocument } from "./client-api";

export interface PendingUpload {
  key: string;
  docType: DocType;
  name: string;
  size: number;
  mime: string;
  progress: number;
  error?: string;
  replaceId?: string;
}

const FORMAT_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/heic": "HEIC",
};

const PROCESS_BADGE: Partial<Record<PublicDocument["processingStatus"], { label: string; tone: "green" | "yellow" | "red" | "blue" | "slate" }>> = {
  processado: { label: "Processado", tone: "green" },
  ilegivel: { label: "Ilegível", tone: "red" },
  incompativel: { label: "Tipo divergente", tone: "red" },
  erro: { label: "Falha no processamento", tone: "red" },
  processando: { label: "Processando", tone: "blue" },
};

export function DocSlot({
  docType,
  docs,
  uploads,
  onFiles,
  onRemove,
  onView,
  onDismissUpload,
  disabled,
}: {
  docType: DocType;
  docs: PublicDocument[];
  uploads: PendingUpload[];
  onFiles: (files: File[], replaceId?: string) => void;
  onRemove: (doc: PublicDocument) => void;
  onView: (doc: PublicDocument) => void;
  onDismissUpload: (key: string) => void;
  disabled?: boolean;
}) {
  const info = DOC_TYPES[docType];
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const complete = docs.length > 0;
  const isPhoto = docType === "foto_veiculo";
  const accept = info.imagesOnly ? ACCEPT_IMAGES_ATTR : ACCEPT_ATTR;
  const canAddMore = info.multiple || docs.length === 0;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(info.multiple ? files : files.slice(0, 1), !info.multiple && docs[0] ? docs[0].id : undefined);
  };

  return (
    <div className={cn("rounded-[var(--radius-card)] border bg-white shadow-[var(--shadow-card)] transition-colors", complete ? "border-emerald-200" : "border-line")} data-testid={`slot-${docType}`}>
      <div className="flex items-start gap-3 px-5 pt-4">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", complete ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600")}>
          {complete ? <CheckCircle2 className="size-[18px]" /> : isPhoto ? <FileImage className="size-[18px]" /> : <FileText className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold">{info.label}</h3>
            {info.required ? <Badge tone={complete ? "green" : "slate"}>{complete ? "Enviado" : "Obrigatório"}</Badge> : <Badge tone="slate">Opcional</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{info.hint}</p>
        </div>
      </div>

      <div className="space-y-2 p-5 pt-3">
        {isPhoto && docs[0] && (
          <button type="button" onClick={() => onView(docs[0])} className="group relative block w-full overflow-hidden rounded-xl border border-line bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={docs[0].url} alt="Foto do veículo" className="mx-auto max-h-64 w-full object-contain" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/70 to-transparent px-3 pb-2 pt-6 text-left text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
              Clique para ampliar
            </span>
          </button>
        )}

        {docs.map((d) => {
          const pb = PROCESS_BADGE[d.processingStatus];
          return (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-line bg-canvas/40 px-3 py-2">
              {d.mimeType === "application/pdf" ? <FileText className="size-5 shrink-0 text-red-500" /> : <FileImage className="size-5 shrink-0 text-brand-500" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" title={d.originalName}>
                  {d.originalName}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                  <span>{FORMAT_LABEL[d.mimeType] ?? d.mimeType}</span>
                  <span>·</span>
                  <span>{formatBytes(d.sizeBytes)}</span>
                  {d.pageCount && d.mimeType === "application/pdf" ? (
                    <>
                      <span>·</span>
                      <span>
                        {d.pageCount} página{d.pageCount > 1 ? "s" : ""}
                      </span>
                    </>
                  ) : null}
                  <span>·</span>
                  <span className="font-semibold text-emerald-700">Enviado</span>
                </div>
                {d.processingMessage && <div className="mt-0.5 text-[11.5px] font-medium text-red-600">{d.processingMessage}</div>}
              </div>
              {pb && <Badge tone={pb.tone}>{pb.label}</Badge>}
              <Tooltip content="Visualizar">
                <Button size="icon-sm" variant="ghost" onClick={() => onView(d)} aria-label={`Visualizar ${d.originalName}`}>
                  <Eye />
                </Button>
              </Tooltip>
              <Tooltip content="Substituir arquivo">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    setReplaceTarget(d.id);
                    replaceRef.current?.click();
                  }}
                  aria-label={`Substituir ${d.originalName}`}
                >
                  <RefreshCw />
                </Button>
              </Tooltip>
              <Tooltip content="Remover">
                <Button size="icon-sm" variant="danger-ghost" disabled={disabled} onClick={() => onRemove(d)} aria-label={`Remover ${d.originalName}`}>
                  <Trash2 />
                </Button>
              </Tooltip>
            </div>
          );
        })}

        {uploads.map((u) => (
          <div key={u.key} className={cn("rounded-lg border px-3 py-2", u.error ? "border-red-200 bg-red-50" : "border-brand-100 bg-brand-50/50")}>
            <div className="flex items-center gap-3">
              {u.error ? <AlertCircle className="size-5 shrink-0 text-red-600" /> : <Loader2 className="size-5 shrink-0 animate-spin text-brand-500" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{u.name}</div>
                <div className="text-[11.5px] text-muted">
                  {formatBytes(u.size)} · {u.error ? <span className="font-semibold text-red-700">{u.error}</span> : u.progress < 1 ? `Enviando… ${Math.round(u.progress * 100)}%` : "Validando arquivo no servidor…"}
                </div>
              </div>
              {u.error && (
                <Button size="sm" variant="ghost" onClick={() => onDismissUpload(u.key)}>
                  Dispensar
                </Button>
              )}
            </div>
            {!u.error && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-100">
                <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${Math.max(4, u.progress * 100)}%` }} />
              </div>
            )}
          </div>
        ))}

        {canAddMore && (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={() => !disabled && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !disabled) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 text-center transition-colors",
              complete ? "py-3" : "py-7",
              drag ? "border-brand-400 bg-brand-50" : "border-line hover:border-brand-300 hover:bg-brand-50/40",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <UploadCloud className={cn("text-brand-400", complete ? "size-5" : "size-7")} />
            <div className="text-[13.5px] font-semibold text-ink-soft">
              {complete ? (info.multiple ? "Adicionar mais arquivos (ex.: verso)" : "Substituir arquivo") : "Arraste o documento aqui ou clique para selecionar"}
            </div>
            {!complete && <div className="text-xs text-muted">{info.imagesOnly ? "JPG, PNG, WEBP ou HEIC" : "PDF, JPG, PNG, WEBP ou HEIC"}</div>}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={accept}
          multiple={info.multiple}
          data-testid={`input-${docType}`}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) onFiles(files);
          }}
        />
        <input
          ref={replaceRef}
          type="file"
          hidden
          accept={accept}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length && replaceTarget) onFiles(files.slice(0, 1), replaceTarget);
            setReplaceTarget(null);
          }}
        />
      </div>
    </div>
  );
}
