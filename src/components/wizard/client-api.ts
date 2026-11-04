"use client";

import type { DocType, RecordKind } from "@/lib/doc-types";
import type { ProcessEvent } from "@/lib/extraction-types";
import type { PublicDocument } from "@/server/services/documents";

export type { PublicDocument };

/** Upload com progresso REAL de envio (XMLHttpRequest.upload.onprogress). */
export function uploadFile(
  kind: RecordKind,
  recordId: string,
  docType: DocType,
  file: File,
  opts: { replaceId?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<PublicDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/records/${kind}/${recordId}/documents`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { document?: PublicDocument; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.document) resolve(body.document);
      else reject(new Error(body?.error ?? `Falha no envio (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Falha de conexão durante o envio."));
    xhr.onabort = () => reject(new Error("Envio cancelado."));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    form.append("docType", docType);
    if (opts.replaceId) form.append("replaceId", opts.replaceId);
    xhr.send(form);
  });
}

/** Lê o stream NDJSON de processamento, chamando onEvent a cada evento. */
export async function streamProcessing(kind: RecordKind, recordId: string, docTypes: DocType[] | undefined, onEvent: (e: ProcessEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`/api/records/${kind}/${recordId}/process`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ docTypes }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Falha ao iniciar o processamento (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onEvent(JSON.parse(line) as ProcessEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as ProcessEvent);
}

export async function generatePdf(kind: RecordKind, recordId: string) {
  const res = await fetch(`/api/records/${kind}/${recordId}/pdf`, { method: "POST" });
  const body = (await res.json().catch(() => null)) as { url?: string; downloadUrl?: string; pageCount?: number; version?: number; error?: string } | null;
  if (!res.ok || !body?.url) throw new Error(body?.error ?? "Falha ao gerar o PDF.");
  return body as { url: string; downloadUrl: string; pageCount: number; version: number };
}
