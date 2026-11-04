import { afterAll, describe, expect, it } from "vitest";
import { degrees, PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { extractText, getDocumentProxy } from "unpdf";
import { assembleFicha, winAnsi, type FooterInfo } from "@/server/pdf/assemble";
import { closeBrowser, htmlToPdf } from "@/server/pdf/render";
import { bankPageHtml, driverFichaHtml, esc, vehicleFichaHtml } from "@/server/pdf/templates";
import { emptyValues } from "@/lib/fields";

const footer: FooterInfo = {
  primary: "#2D5A94",
  accent: "#F4CF14",
  companyName: "Transportadora Fictícia",
  phones: ["(11) 90000-0000"],
  website: "www.exemplo.com.br",
  emails: ["contato@exemplo.com.br"],
  smallLines: [],
  logo: null,
  generatedLabel: "Gerado em teste",
};
const ctx = { theme: { primary: "#2D5A94", accent: "#F4CF14" }, generatedAt: "04/11/2026 10:00", version: 1, generatedBy: "Teste" };

async function textOf(pdf: Buffer) {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

afterAll(async () => {
  await closeBrowser();
});

describe("templates da ficha", () => {
  it("escapa HTML dos dados (sem injeção no template)", () => {
    expect(esc('<img src=x onerror="1">')).toBe("&lt;img src=x onerror=&quot;1&quot;&gt;");
    const html = driverFichaHtml({ ...emptyValues("driver"), nome: "<script>alert(1)</script>" }, ctx);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("remove caracteres não suportados pela fonte do rodapé", () => {
    expect(winAnsi("Ação → teste 😀 — ok")).toBe("Ação  teste  - ok");
  });
});

describe("geração do PDF final", () => {
  it("gera ficha de motorista com dados salvos + página bancária + documentos originais", async () => {
    const values = {
      ...emptyValues("driver"),
      nome: "MOTORISTA FICTICIO DE TESTE",
      cpf: "12345678909",
      cnhNumero: "1234567890",
      cnhCategoria: "AE",
      cnhValidade: "2031-08-20",
      telefonePrincipal: "11988887777",
      contatoComercialNome: "Fulano",
      bancoNome: "Banco Ficticio",
      conta: "12345",
      titularNome: "MOTORISTA FICTICIO DE TESTE",
    };
    const ficha = await htmlToPdf(driverFichaHtml(values, ctx));
    const bank = await htmlToPdf(bankPageHtml(values, ctx, "Transportadora Fictícia"));

    // Documento original de 2 páginas (uma rotacionada) + uma imagem paisagem
    const src = await PDFDocument.create();
    src.addPage([612, 792]).drawText("PAGINA ORIGINAL 1", { x: 50, y: 700 });
    const p2 = src.addPage([612, 792]);
    p2.drawText("PAGINA ORIGINAL 2", { x: 50, y: 700 });
    p2.setRotation(degrees(90));
    const original = Buffer.from(await src.save());
    const img = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#88aacc" } }).jpeg().toBuffer();

    const { pdf, pageCount } = await assembleFicha({
      fichaPdf: ficha,
      insertBefore: { dados_bancarios: bank },
      attachments: [
        { docType: "cnh", name: "cnh.pdf", mime: "application/pdf", data: original },
        { docType: "comprovante_residencia", name: "comp.jpg", mime: "image/jpeg", data: img },
        { docType: "dados_bancarios", name: "banco.jpg", mime: "image/jpeg", data: img },
      ],
      footer,
      footerOnDocuments: true,
      title: "Ficha teste",
    });

    const fichaPages = (await PDFDocument.load(ficha)).getPageCount();
    expect(pageCount).toBe(fichaPages + 2 + 1 + 1 + 1); // ficha + 2 págs CNH + comprovante + página bancária + banco
    const out = await PDFDocument.load(pdf);
    for (const page of out.getPages()) {
      const { width, height } = page.getSize();
      expect(Math.round(Math.min(width, height))).toBe(595); // A4
    }
    // Imagem paisagem em página paisagem (sem distorção)
    const imgPage = out.getPage(fichaPages + 2).getSize();
    expect(imgPage.width).toBeGreaterThan(imgPage.height);

    const text = await textOf(pdf);
    expect(text).toContain("FICHA CADASTRAL DE MOTORISTA");
    expect(text).toContain("MOTORISTA FICTICIO DE TESTE");
    expect(text).toContain("123.456.789-09");
    expect(text).toContain("DADOS BANCÁRIOS");
    expect(text).toContain("PAGINA ORIGINAL 1");
    expect(text).toContain("PAGINA ORIGINAL 2");
    expect(text).toContain("(11) 90000-0000");
    expect(text).toMatch(/Página 1 de \d+/);
  }, 60000);

  it("preserva páginas originais sem alteração quando o rodapé nos anexos está desativado", async () => {
    const ficha = await htmlToPdf(vehicleFichaHtml({ ...emptyValues("vehicle"), placa: "ABC1D23", marca: "VW", modelo: "TESTE" }, ctx));
    const src = await PDFDocument.create();
    src.addPage([400, 500]).drawText("ORIGINAL");
    const { pdf } = await assembleFicha({
      fichaPdf: ficha,
      attachments: [{ docType: "crlv", name: "crlv.pdf", mime: "application/pdf", data: Buffer.from(await src.save()) }],
      footer,
      footerOnDocuments: false,
      title: "t",
    });
    const out = await PDFDocument.load(pdf);
    const last = out.getPage(out.getPageCount() - 1).getSize();
    expect(last).toEqual({ width: 400, height: 500 });
    const text = await textOf(pdf);
    expect(text).toContain("FICHA CADASTRAL DE VEÍCULO");
    expect(text).toContain("ABC1D23");
  }, 60000);
});
