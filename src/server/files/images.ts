import "server-only";
import sharp from "sharp";

export interface RasterImage {
  data: Buffer;
  format: "jpeg" | "png";
  width: number;
  height: number;
}

async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const mod = (await import("heic-convert")) as unknown as {
    default: (o: { buffer: Buffer | ArrayBuffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer | Buffer>;
  };
  const out = await mod.default({ buffer: buf, format: "JPEG", quality: 0.92 });
  return Buffer.from(out as ArrayBuffer);
}

/** Converte qualquer imagem aceita em JPEG/PNG com rotação EXIF aplicada. */
export async function toRaster(buf: Buffer, mime: string, opts: { maxSide?: number; quality?: number } = {}): Promise<RasterImage> {
  const input = mime === "image/heic" ? await heicToJpeg(buf) : buf;
  const maxSide = opts.maxSide ?? 3000;
  let pipeline = sharp(input, { limitInputPixels: 80_000_000 }).rotate();
  pipeline = pipeline.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
  const meta = await sharp(input).metadata();
  const keepPng = mime === "image/png" && !!meta.hasAlpha;
  const { data, info } = keepPng
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: opts.quality ?? 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data, format: keepPng ? "png" : "jpeg", width: info.width, height: info.height };
}

/** Imagem otimizada para envio a provedores de IA/OCR. */
export async function toAiImage(buf: Buffer, mime: string): Promise<{ data: Buffer; mime: "image/jpeg" | "image/png" }> {
  const r = await toRaster(buf, mime, { maxSide: 2000, quality: 85 });
  return { data: r.data, mime: r.format === "png" ? "image/png" : "image/jpeg" };
}

/** Pré-processamento para OCR local (escala de cinza, contraste). */
export async function toOcrImage(buf: Buffer, mime: string): Promise<Buffer> {
  const input = mime === "image/heic" ? await heicToJpeg(buf) : buf;
  return sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: false })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

/** Miniatura para pré-visualização na interface. */
export async function thumbnail(buf: Buffer, mime: string, size = 480): Promise<Buffer> {
  const input = mime === "image/heic" ? await heicToJpeg(buf) : buf;
  return sharp(input).rotate().resize({ width: size, height: size, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
}
