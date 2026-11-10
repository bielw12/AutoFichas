import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyProposals, buildProposals } from "@/lib/merge";
import type { SessionUser } from "@/server/auth/session";
import { processAndCollect } from "@/server/ai/pipeline";
import { db } from "@/server/db";
import { companySettings } from "@/server/db/schema";
import { closeBrowser } from "@/server/pdf/render";
import { uploadDocument } from "@/server/services/documents";
import { generateFicha } from "@/server/services/ficha";
import { createDraft, finalizeRecord, getLatestExtractions, getRecord, recomputeAllStatuses, rowToValues } from "@/server/services/records";
import { storage } from "@/server/storage";
import { cnpjWithDv, writeFixtures, type FixtureSet } from "../fixtures/documents";
import { makeUser, resetDatabase } from "./helpers";

let files: FixtureSet;
let operador: SessionUser;
const CNPJ = cnpjWithDv("998877660001");

async function pdfText(buf: Buffer) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

beforeAll(async () => {
  await resetDatabase();
  files = await writeFixtures(path.resolve("test-results/fixtures-bank"));
  operador = await makeUser("operador");
}, 120000);

afterAll(async () => {
  await closeBrowser();
});

describe("dados bancários padrão nas configurações", () => {
  let id: string;

  it("ficha de motorista sem documento bancário fica completa e usa a conta da transportadora no PDF", async () => {
    await db
      .update(companySettings)
      .set({
        bankSource: "empresa",
        bankName: "Banco Padrão da Transportadora",
        bankCode: "341",
        bankAgency: "4321",
        bankAccount: "55555",
        bankAccountDigit: "7",
        bankAccountType: "corrente",
        bankHolderName: "TRANSPORTADORA FICTICIA DE TESTES LTDA",
        bankHolderDocument: CNPJ,
        bankPixType: "cnpj",
        bankPixKey: CNPJ,
      })
      .where(eq(companySettings.id, 1));

    id = await createDraft("driver", operador);
    for (const [docType, file] of [["cnh", files.cnhPdf], ["comprovante_residencia", files.comprovantePng]] as const) {
      await uploadDocument({ kind: "driver", recordId: id, docType, fileName: path.basename(file), buffer: await readFile(file), user: operador });
    }
    await processAndCollect({ kind: "driver", recordId: id, user: operador });
    const filled = applyProposals(rowToValues("driver", (await getRecord("driver", id))!), {}, buildProposals("driver", await getLatestExtractions("driver", id)));
    const values = { ...filled.values, telefonePrincipal: "11988887777", enderecoVinculo: "proprio" };

    // Sem documento bancário e sem dados bancários do motorista: não é pendência
    expect(await finalizeRecord("driver", id, values, filled.meta, [], operador, { allowMissingDocs: false })).toBe("completo");

    await generateFicha("driver", id, operador);
    const text = await pdfText(await storage().get((await getRecord("driver", id))!.pdfStorageKey!));
    expect(text).toContain("DADOS BANCÁRIOS");
    expect(text).toContain("Banco Padrão da Transportadora");
    expect(text).toContain("TRANSPORTADORA FICTICIA DE TESTES LTDA");
    expect(text).toContain("4321");
    expect(text).toContain("55555-7");
    expect(text).toContain("Chave PIX (CNPJ)");
    expect(text).not.toContain("Dados pertencem a");
  }, 120000);

  it("ao voltar a usar os dados do motorista, a situação é recalculada", async () => {
    await db.update(companySettings).set({ bankSource: "motorista" }).where(eq(companySettings.id, 1));
    await recomputeAllStatuses("driver");
    expect((await getRecord("driver", id))!.baseStatus).toBe("documentacao_pendente");

    await db.update(companySettings).set({ bankSource: "empresa" }).where(eq(companySettings.id, 1));
    await recomputeAllStatuses("driver");
    expect((await getRecord("driver", id))!.baseStatus).toBe("completo");
  });

  it("configuração vazia mantém o comportamento anterior (dados do motorista)", async () => {
    await db.update(companySettings).set({ bankName: "", bankAccount: "", bankPixKey: "" }).where(eq(companySettings.id, 1));
    await recomputeAllStatuses("driver");
    expect((await getRecord("driver", id))!.baseStatus).toBe("documentacao_pendente");
  });
});
