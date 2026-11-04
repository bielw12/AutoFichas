import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { DOC_TYPES, type DocType } from "@/lib/doc-types";
import { toRaster } from "../files/images";
import { FOOTER_HEIGHT } from "./templates";

const A4 = { w: 595.28, h: 841.89 };

export interface FooterInfo {
  primary: string;
  accent: string;
  companyName: string;
  phones: string[];
  website: string;
  emails: string[];
  smallLines: string[];
  logo: { data: Buffer; mime: string } | null;
  generatedLabel: string;
}

export interface AttachmentInput {
  docType: DocType;
  name: string;
  mime: string;
  data: Buffer;
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? ["", "2d", "5a", "94"];
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

/** Mantém apenas caracteres codificáveis pela fonte padrão (WinAnsi). */
export function winAnsi(s: string): string {
  return s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ•]/g, "");
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const full = winAnsi(text);
  if (font.widthOfTextAtSize(full, size) <= maxWidth) return full;
  let t = full;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

async function embedLogo(pdf: PDFDocument, logo: FooterInfo["logo"]): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    const r = await toRaster(logo.data, logo.mime, { maxSide: 800 });
    return r.format === "png" ? await pdf.embedPng(r.data) : await pdf.embedJpg(r.data);
  } catch {
    return null;
  }
}

/** Desenha a faixa institucional (rodapé) e a numeração em todas as páginas. */
export async function stampFooter(pdf: PDFDocument, info: FooterInfo, opts: { skipPages?: Set<number> } = {}) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(pdf, info.logo);
  const band = hexToRgb(info.primary);
  const accent = hexToRgb(info.accent);
  const pages = pdf.getPages();
  const total = pages.length;

  pages.forEach((page, idx) => {
    const { width } = page.getSize();
    const label = `${info.generatedLabel} · Página ${idx + 1} de ${total}`;
    const lw = regular.widthOfTextAtSize(winAnsi(label), 7);
    page.drawText(winAnsi(label), { x: width - 24 - lw, y: FOOTER_HEIGHT + 7, size: 7, font: regular, color: rgb(0.55, 0.58, 0.64) });
    if (opts.skipPages?.has(idx)) return;

    page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_HEIGHT, color: band });
    page.drawRectangle({ x: 0, y: FOOTER_HEIGHT, width, height: 2.2, color: accent });

    const logoBox = { w: Math.min(190, width * 0.34), h: FOOTER_HEIGHT - 26 };
    const textMax = width - 48 - logoBox.w - 16;
    const lines: { text: string; font: PDFFont; size: number }[] = [];
    info.phones.slice(0, 2).forEach((p, i) => lines.push({ text: p, font: i === 0 ? bold : regular, size: i === 0 ? 11 : 9.5 }));
    if (info.website) lines.push({ text: info.website, font: regular, size: 9.5 });
    info.emails.slice(0, 3).forEach((e) => lines.push({ text: e, font: regular, size: 9.5 }));
    info.smallLines.forEach((s) => lines.push({ text: s, font: regular, size: 7.5 }));
    const used = lines.slice(0, 6);
    const totalH = used.reduce((a, l) => a + l.size * 1.32, 0);
    let y = used.length ? FOOTER_HEIGHT / 2 + totalH / 2 - used[0].size * 0.95 : FOOTER_HEIGHT / 2;
    for (const l of used) {
      page.drawText(fitText(l.font, l.text, l.size, textMax), { x: 24, y, size: l.size, font: l.font, color: rgb(1, 1, 1) });
      y -= l.size * 1.32;
    }

    const boxX = width - 24 - logoBox.w;
    const boxY = 13;
    if (logo) {
      const s = Math.min(logoBox.w / logo.width, logoBox.h / logo.height);
      const w = logo.width * s;
      const h = logo.height * s;
      page.drawImage(logo, { x: boxX + (logoBox.w - w) / 2, y: boxY + (logoBox.h - h) / 2, width: w, height: h });
    } else if (info.companyName) {
      const name = winAnsi(info.companyName.toUpperCase());
      let size = 15;
      while (size > 8 && bold.widthOfTextAtSize(name, size) > logoBox.w) size -= 0.5;
      const t = fitText(bold, name, size, logoBox.w);
      const tw = bold.widthOfTextAtSize(t, size);
      page.drawText(t, { x: boxX + logoBox.w - tw, y: FOOTER_HEIGHT / 2 - 5, size, font: bold, color: accent });
    }
  });
}

function contentArea(page: { w: number; h: number }) {
  const margin = 26;
  return { x: margin, y: FOOTER_HEIGHT + 20, w: page.w - margin * 2, h: page.h - FOOTER_HEIGHT - 20 - margin };
}

/** Desenha uma página de PDF original preservando conteúdo vetorial e rotação. */
async function drawEmbeddedPdfPage(out: PDFDocument, src: PDFDocument, index: number): Promise<PDFPage> {
  const srcPage = src.getPage(index);
  const rotation = ((srcPage.getRotation().angle % 360) + 360) % 360;
  const embedded = await out.embedPage(srcPage);
  const rotated = rotation === 90 || rotation === 270;
  const visW = rotated ? embedded.height : embedded.width;
  const visH = rotated ? embedded.width : embedded.height;
  const pageSize = visW > visH * 1.05 ? { w: A4.h, h: A4.w } : A4;
  const page = out.addPage([pageSize.w, pageSize.h]);
  const area = contentArea(pageSize);
  const s = Math.min(area.w / visW, area.h / visH);
  const dw = visW * s;
  const dh = visH * s;
  const left = area.x + (area.w - dw) / 2;
  const bottom = area.y + (area.h - dh) / 2;
  const W = embedded.width * s;
  const H = embedded.height * s;
  if (rotation === 90) page.drawPage(embedded, { x: left, y: bottom + W, xScale: s, yScale: s, rotate: degrees(-90) });
  else if (rotation === 270) page.drawPage(embedded, { x: left + H, y: bottom, xScale: s, yScale: s, rotate: degrees(90) });
  else if (rotation === 180) page.drawPage(embedded, { x: left + W, y: bottom + H, xScale: s, yScale: s, rotate: degrees(180) });
  else page.drawPage(embedded, { x: left, y: bottom, xScale: s, yScale: s });
  return page;
}

async function drawImagePage(out: PDFDocument, att: AttachmentInput, fill: boolean) {
  const r = await toRaster(att.data, att.mime, { maxSide: 3000, quality: 90 });
  const img = r.format === "png" ? await out.embedPng(r.data) : await out.embedJpg(r.data);
  const landscape = img.width > img.height * 1.1;
  const pageSize = landscape ? { w: A4.h, h: A4.w } : A4;
  const page = out.addPage([pageSize.w, pageSize.h]);
  const area = contentArea(pageSize);
  if (fill) {
    area.x = 14;
    area.w = pageSize.w - 28;
    area.h = pageSize.h - area.y - 14;
  }
  const s = Math.min(area.w / img.width, area.h / img.height);
  const w = img.width * s;
  const h = img.height * s;
  page.drawImage(img, { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, width: w, height: h });
}

export interface AssembleInput {
  fichaPdf: Buffer;
  /** Página(s) gerada(s) inseridas antes dos anexos de um tipo (ex.: dados bancários). */
  insertBefore?: Partial<Record<DocType, Buffer>>;
  attachments: AttachmentInput[];
  footer: FooterInfo;
  footerOnDocuments: boolean;
  title: string;
}

/**
 * Monta o PDF final: ficha principal + documentos originais (todas as páginas,
 * sem distorção) + faixa institucional em todas as páginas.
 */
export async function assembleFicha(input: AssembleInput): Promise<{ pdf: Buffer; pageCount: number }> {
  const out = await PDFDocument.create();
  out.setTitle(input.title);
  out.setCreator("AutoFichas");
  out.setProducer("AutoFichas");
  out.setLanguage("pt-BR");
  const skipFooter = new Set<number>();

  const append = async (buf: Buffer, preserve: boolean) => {
    const src = await PDFDocument.load(buf, { ignoreEncryption: false });
    if (preserve) {
      const copied = await out.copyPages(src, src.getPageIndices());
      for (const p of copied) {
        out.addPage(p);
        skipFooter.add(out.getPageCount() - 1);
      }
    } else {
      for (const i of src.getPageIndices()) await drawEmbeddedPdfPage(out, src, i);
    }
  };

  // Ficha principal (já reserva espaço para o rodapé)
  const ficha = await PDFDocument.load(input.fichaPdf);
  for (const p of await out.copyPages(ficha, ficha.getPageIndices())) out.addPage(p);

  const inserted = new Set<DocType>();
  for (const att of input.attachments) {
    const before = input.insertBefore?.[att.docType];
    if (before && !inserted.has(att.docType)) {
      inserted.add(att.docType);
      const b = await PDFDocument.load(before);
      for (const p of await out.copyPages(b, b.getPageIndices())) out.addPage(p);
    }
    if (att.mime === "application/pdf") {
      await append(att.data, !input.footerOnDocuments);
    } else {
      await drawImagePage(out, att, att.docType === "foto_veiculo");
    }
  }
  // Página gerada sem anexos correspondentes (ex.: dados bancários informados manualmente)
  for (const [docType, buf] of Object.entries(input.insertBefore ?? {})) {
    if (!inserted.has(docType as DocType) && buf) {
      const b = await PDFDocument.load(buf);
      for (const p of await out.copyPages(b, b.getPageIndices())) out.addPage(p);
    }
  }

  await stampFooter(out, input.footer, { skipPages: skipFooter });
  const bytes = await out.save({ useObjectStreams: true });
  return { pdf: Buffer.from(bytes), pageCount: out.getPageCount() };
}

export function attachmentLabel(docType: DocType) {
  return DOC_TYPES[docType].shortLabel;
}
