import "server-only";
import { createHash } from "node:crypto";
import net from "node:net";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { DOC_TYPES, type DocType } from "@/lib/doc-types";
import { maxUploadBytes } from "../env";

export type DetectedMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export const EXT_BY_MIME: Record<DetectedMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Detecta o tipo real pelo conteúdo (magic bytes), ignorando nome/extensão. */
export function detectMime(buf: Buffer): DetectedMime | null {
  if (buf.length < 12) return null;
  // PDF pode ter alguns bytes de lixo antes do cabeçalho (até 1024 pela especificação)
  const head = buf.subarray(0, 1024).toString("latin1");
  if (head.includes("%PDF-")) return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

export class UploadError extends Error {}

const DANGEROUS_PDF_TOKENS = [/\/JavaScript\b/, /\/JS\s*[(<[]/, /\/Launch\b/, /\/EmbeddedFiles?\b/, /\/RichMedia\b/, /\/SubmitForm\b/, /\/ImportData\b/];

export interface ValidatedFile {
  buffer: Buffer;
  mime: DetectedMime;
  ext: string;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  safeName: string;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "arquivo";
  return base.normalize("NFC").replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 150) || "arquivo";
}

export async function validateUpload(buffer: Buffer, originalName: string, docType: DocType): Promise<ValidatedFile> {
  if (!buffer.length) throw new UploadError("Arquivo vazio.");
  if (buffer.length > maxUploadBytes()) {
    throw new UploadError(`Arquivo excede o limite de ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);
  }
  const mime = detectMime(buffer);
  if (!mime) throw new UploadError("Formato não suportado. Envie PDF, JPG, PNG, WEBP ou HEIC.");
  if (DOC_TYPES[docType].imagesOnly && mime === "application/pdf") {
    throw new UploadError("Para a foto do veículo, envie uma imagem (JPG, PNG, WEBP ou HEIC).");
  }

  let pageCount = 1;
  if (mime === "application/pdf") {
    const latin = buffer.toString("latin1");
    if (DANGEROUS_PDF_TOKENS.some((re) => re.test(latin))) {
      throw new UploadError("O PDF contém conteúdo ativo (scripts, anexos ou ações) e foi bloqueado por segurança.");
    }
    try {
      const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
      pageCount = pdf.getPageCount();
      // Verificação adicional em objetos já descomprimidos pelo parser
      const catalog = pdf.catalog.toString();
      if (/\/(OpenAction|AA)[\s\S]*\/(JavaScript|Launch)/.test(catalog) || /\/Names[\s\S]*\/(JavaScript|EmbeddedFiles)/.test(catalog)) {
        throw new UploadError("O PDF contém ações automáticas e foi bloqueado por segurança.");
      }
    } catch (err) {
      if (err instanceof UploadError) throw err;
      const msg = (err as Error).message ?? "";
      if (/encrypt/i.test(msg)) throw new UploadError("PDF protegido por senha. Envie uma versão sem senha.");
      throw new UploadError("PDF corrompido ou inválido.");
    }
    if (pageCount < 1) throw new UploadError("PDF sem páginas.");
    if (pageCount > 60) throw new UploadError("PDF com páginas demais (máximo 60).");
  } else if (mime !== "image/heic") {
    try {
      const meta = await sharp(buffer, { limitInputPixels: 80_000_000 }).metadata();
      if (!meta.width || !meta.height) throw new Error("sem dimensões");
      if (meta.width < 200 || meta.height < 200) throw new UploadError("Imagem muito pequena para leitura (mínimo 200×200 px).");
    } catch (err) {
      if (err instanceof UploadError) throw err;
      throw new UploadError("Imagem corrompida ou inválida.");
    }
  }

  await scanWithClamAV(buffer);

  return {
    buffer,
    mime,
    ext: EXT_BY_MIME[mime],
    sha256: createHash("sha256").update(buffer).digest("hex"),
    pageCount,
    sizeBytes: buffer.length,
    safeName: sanitizeFileName(originalName),
  };
}

/** Varredura antivírus opcional via clamd (protocolo INSTREAM). */
export async function scanWithClamAV(buffer: Buffer): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return;
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  const result = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write("zINSTREAM\0");
      const chunk = 64 * 1024;
      for (let i = 0; i < buffer.length; i += chunk) {
        const part = buffer.subarray(i, i + chunk);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
    let data = "";
    socket.setTimeout(30000, () => socket.destroy(new Error("timeout")));
    socket.on("data", (d) => (data += d.toString()));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  }).catch((err: Error) => {
    throw new UploadError(`Antivírus indisponível (${err.message}). Upload bloqueado por segurança.`);
  });
  if (!/OK\0?\s*$/.test(result)) {
    throw new UploadError("O arquivo foi identificado como potencialmente malicioso e foi bloqueado.");
  }
}
