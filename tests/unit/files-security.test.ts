import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { sanitizeDetails } from "@/server/audit";
import { detectMime, sanitizeFileName, UploadError, validateUpload } from "@/server/files/validate";
import { decryptBuffer, encryptBuffer } from "@/server/storage";
import { signParams, verifySignature } from "@/server/signed-url";

vi.mock("@/server/db", () => ({ db: {} }));

async function simplePdf(extra = ""): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText("Documento ficticio");
  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  return extra ? Buffer.concat([bytes, Buffer.from(extra)]) : bytes;
}

describe("validação de arquivos no servidor", () => {
  it("detecta o tipo real pelo conteúdo, não pela extensão", async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(detectMime(png)).toBe("image/png");
    expect(detectMime(await simplePdf())).toBe("application/pdf");
    expect(detectMime(Buffer.from("MZ\x90\x00 executavel disfarçado de pdf"))).toBeNull();
    await expect(validateUpload(Buffer.from("<script>alert(1)</script>".repeat(10)), "cnh.pdf", "cnh")).rejects.toThrow(/Formato não suportado/);
  });

  it("aceita PDF e imagem válidos e calcula metadados", async () => {
    const ok = await validateUpload(await simplePdf(), "minha cnh.pdf", "cnh");
    expect(ok).toMatchObject({ mime: "application/pdf", ext: "pdf", pageCount: 1 });
    expect(ok.sha256).toHaveLength(64);
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ccc" } }).jpeg().toBuffer();
    expect((await validateUpload(jpg, "foto.jpg", "foto_veiculo")).mime).toBe("image/jpeg");
  });

  it("bloqueia PDF com JavaScript ou ações automáticas", async () => {
    const malicious = await simplePdf("\n1 0 obj << /Type /Action /S /JavaScript /JS (app.alert(1)) >> endobj\n");
    await expect(validateUpload(malicious, "x.pdf", "cnh")).rejects.toThrow(/conteúdo ativo/);
  });

  it("bloqueia PDF corrompido, imagem minúscula e PDF como foto do veículo", async () => {
    await expect(validateUpload(Buffer.from("%PDF-1.4\n%%EOF lixo"), "x.pdf", "cnh")).rejects.toBeInstanceOf(UploadError);
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(validateUpload(tiny, "x.png", "cnh")).rejects.toThrow(/pequena/);
    await expect(validateUpload(await simplePdf(), "x.pdf", "foto_veiculo")).rejects.toThrow(/imagem/);
  });

  it("limita o tamanho do upload", async () => {
    process.env.MAX_UPLOAD_MB = "0.0001";
    await expect(validateUpload(await simplePdf(), "x.pdf", "cnh")).rejects.toThrow(/limite/);
    process.env.MAX_UPLOAD_MB = "15";
  });

  it("higieniza nomes de arquivo", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('CNH <João> "frente".jpg')).toBe("CNH _João_ _frente_.jpg");
  });
});

describe("proteção dos dados armazenados", () => {
  it("criptografa arquivos com AES-256-GCM e detecta adulteração", () => {
    const key = Buffer.alloc(32, 3);
    const plain = Buffer.from("CPF 123.456.789-09");
    const enc = encryptBuffer(plain, key);
    expect(enc.includes(plain)).toBe(false);
    expect(decryptBuffer(enc, key).equals(plain)).toBe(true);
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptBuffer(tampered, key)).toThrow();
    expect(() => decryptBuffer(enc, null)).toThrow(/STORAGE_ENCRYPTION_KEY/);
  });

  it("URLs temporárias: vinculadas ao usuário, ao recurso e com expiração", () => {
    const r = { t: "doc" as const, id: "11111111-1111-1111-1111-111111111111" };
    const { exp, sig } = signParams(r, "user-a");
    expect(verifySignature(r, "user-a", exp, sig)).toBe("ok");
    expect(verifySignature(r, "user-b", exp, sig)).toBe("invalid");
    expect(verifySignature({ t: "doc", id: "22222222-2222-2222-2222-222222222222" }, "user-a", exp, sig)).toBe("invalid");
    expect(verifySignature(r, "user-a", String(Number(exp) + 100), sig)).toBe("invalid");
    const old = signParams(r, "user-a", -10);
    expect(verifySignature(r, "user-a", old.exp, old.sig)).toBe("expired");
    expect(verifySignature(r, "user-a", null, null)).toBe("invalid");
  });

  it("logs de auditoria não registram CPF, PIX, contas ou valores", () => {
    const clean = sanitizeDetails({ cpf: "12345678909", pixChave: "x@y.com", conta: "123", campos: ["cpf", "nome"], value: "segredo", tipo: "cnh", nested: { agencia: "1", total: 2 } });
    expect(clean).toEqual({ campos: ["cpf", "nome"], tipo: "cnh", nested: { total: 2 } });
  });
});
