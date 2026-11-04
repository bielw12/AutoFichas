"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, ImageIcon, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlays";
import { DOC_TYPES } from "@/lib/doc-types";
import { cn } from "@/lib/utils";
import type { PublicDocument } from "@/components/wizard/client-api";

/** Visualizador de documentos originais (imagem com zoom/rotação ou PDF nativo). */
export function DocViewer({ docs, activeId, onSelect, className, emptyText }: { docs: PublicDocument[]; activeId?: string | null; onSelect?: (id: string) => void; className?: string; emptyText?: string }) {
  const active = docs.find((d) => d.id === activeId) ?? docs[0] ?? null;
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [active?.id]);

  if (!active) {
    return (
      <div className={cn("flex h-full min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/60 p-6 text-center text-sm text-muted", className)}>
        <FileText className="mb-2 size-6" />
        {emptyText ?? "Selecione um campo para ver o documento de origem."}
      </div>
    );
  }
  const isPdf = active.mimeType === "application/pdf";
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white", className)}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {isPdf ? <FileText className="size-4 text-brand-500" /> : <ImageIcon className="size-4 text-brand-500" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{DOC_TYPES[active.docType].shortLabel}</div>
          <div className="truncate text-[11px] text-muted">{active.originalName}</div>
        </div>
        {!isPdf && (
          <>
            <Tooltip content="Diminuir">
              <Button size="icon-sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Diminuir zoom">
                <ZoomOut />
              </Button>
            </Tooltip>
            <Tooltip content="Ampliar">
              <Button size="icon-sm" variant="ghost" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Ampliar">
                <ZoomIn />
              </Button>
            </Tooltip>
            <Tooltip content="Girar">
              <Button size="icon-sm" variant="ghost" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Girar imagem">
                <RotateCw />
              </Button>
            </Tooltip>
          </>
        )}
        <Tooltip content="Abrir em nova aba">
          <Button size="icon-sm" variant="ghost" asChild>
            <a href={active.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba">
              <ExternalLink />
            </a>
          </Button>
        </Tooltip>
        <Tooltip content="Baixar original">
          <Button size="icon-sm" variant="ghost" asChild>
            <a href={`${active.url}&download=1`} aria-label="Baixar original">
              <Download />
            </a>
          </Button>
        </Tooltip>
      </div>
      {docs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-line bg-canvas/50 px-2 py-1.5 scrollbar-thin">
          {docs.map((d, i) => (
            <button
              key={d.id}
              onClick={() => onSelect?.(d.id)}
              className={cn("shrink-0 rounded-md px-2 py-1 text-[11.5px] font-semibold", d.id === active.id ? "bg-white text-brand-700 shadow-sm ring-1 ring-line" : "text-muted hover:text-ink")}
            >
              {DOC_TYPES[d.docType].shortLabel} {docs.filter((x) => x.docType === d.docType).length > 1 ? `#${docs.filter((x) => x.docType === d.docType).indexOf(d) + 1}` : ""}
              <span className="sr-only"> arquivo {i + 1}</span>
            </button>
          ))}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-auto bg-[#e9edf3]">
        {isPdf ? (
          <iframe key={active.id} src={`${active.url}#view=FitH`} title={active.originalName} className="h-full min-h-[520px] w-full border-0" />
        ) : (
          <div className="flex min-h-full items-start justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={`${DOC_TYPES[active.docType].shortLabel} — ${active.originalName}`}
              style={{ transform: `rotate(${rotation}deg)`, width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none" }}
              className="origin-center rounded-md bg-white shadow-sm transition-transform"
            />
          </div>
        )}
      </div>
    </div>
  );
}
