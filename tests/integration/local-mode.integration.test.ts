import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCurrentUser, getLocalUser, LOCAL_USER_EMAIL } from "@/server/auth/session";
import { db } from "@/server/db";
import { companySettings, users } from "@/server/db/schema";
import { closeBrowser } from "@/server/pdf/render";
import { uploadDocument } from "@/server/services/documents";
import { generateFicha } from "@/server/services/ficha";
import { createDraft, getRecord } from "@/server/services/records";
import { getLogo, getSettings } from "@/server/services/settings";
import { storage, storageKeys } from "@/server/storage";
import { writeFixtures, type FixtureSet } from "../fixtures/documents";
import { resetDatabase } from "./helpers";

let files: FixtureSet;

beforeAll(async () => {
  await resetDatabase();
  files = await writeFixtures(path.resolve("test-results/fixtures-local"));
}, 120000);

afterAll(async () => {
  process.env.AUTH_DISABLED = "false";
  await closeBrowser();
});

describe("modo local sem login (AUTH_DISABLED=true)", () => {
  it("usa automaticamente um usuário local administrador", async () => {
    process.env.AUTH_DISABLED = "true";
    const u = await getCurrentUser();
    expect(u).toMatchObject({ email: LOCAL_USER_EMAIL, role: "admin", mustChangePassword: false });
    // idempotente: não cria usuários duplicados
    await getLocalUser();
    const rows = await db.select().from(users).where(eq(users.email, LOCAL_USER_EMAIL));
    expect(rows).toHaveLength(1);
    // o usuário local consegue criar fichas (chaves estrangeiras válidas)
    const id = await createDraft("driver", u!);
    expect(await getRecord("driver", id)).not.toBeNull();
  });

  it("reativa o usuário local se ele tiver sido desativado", async () => {
    await db.update(users).set({ active: false, role: "visualizador" }).where(eq(users.email, LOCAL_USER_EMAIL));
    const u = await getLocalUser();
    expect(u.role).toBe("admin");
    const [row] = await db.select().from(users).where(eq(users.email, LOCAL_USER_EMAIL));
    expect(row).toMatchObject({ active: true, role: "admin" });
  });
});

describe("logotipo e informações padrão do sistema", () => {
  it("aplica o logotipo configurado no rodapé de todas as páginas da ficha", async () => {
    const user = await getLocalUser();
    const id = await createDraft("driver", user);
    await uploadDocument({ kind: "driver", recordId: id, docType: "cnh", fileName: "cnh.pdf", buffer: await readFile(files.cnhPdf), user });

    const countImages = async () => {
      const row = (await getRecord("driver", id))!;
      const buf = await storage().get(row.pdfStorageKey!);
      const pdf = await PDFDocument.load(buf);
      return { images: (buf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length, pages: pdf.getPageCount(), text: buf };
    };

    await generateFicha("driver", id, user);
    const without = await countImages();

    // Logotipo PNG com transparência, como seria enviado nas Configurações
    const logo = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 244, g: 201, b: 28, alpha: 1 } } }).png().toBuffer();
    const key = storageKeys.logo("png");
    await storage().put(key, logo, "image/png");
    await db.update(companySettings).set({ logoStorageKey: key, logoMime: "image/png", companyName: "Transportadora Local", phones: "(11) 95555-0000" }).where(eq(companySettings.id, 1));
    expect(await getLogo(await getSettings())).not.toBeNull();

    await generateFicha("driver", id, user);
    const withLogo = await countImages();
    expect(withLogo.pages).toBe(without.pages);
    // o mesmo objeto de imagem é reutilizado em todas as páginas
    expect(withLogo.images).toBeGreaterThan(without.images);
    const pdf = await PDFDocument.load(withLogo.text);
    for (const page of pdf.getPages()) {
      const xobjects = page.node.Resources()?.get(PDFName.of("XObject"));
      expect(xobjects, "página sem imagem do logotipo").toBeTruthy();
    }
  }, 60000);
});
