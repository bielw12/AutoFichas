import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DocType, RecordKind } from "@/lib/doc-types";
import { formatCPF } from "@/lib/format";
import { applyProposals, buildProposals, diffProposals } from "@/lib/merge";
import type { SessionUser } from "@/server/auth/session";
import { processAndCollect } from "@/server/ai/pipeline";
import { db } from "@/server/db";
import { auditLogs, documents, extractionResults } from "@/server/db/schema";
import { closeBrowser } from "@/server/pdf/render";
import { uploadDocument } from "@/server/services/documents";
import { dashboardData } from "@/server/services/dashboard";
import { generateFicha } from "@/server/services/ficha";
import {
  archiveRecord,
  createDraft,
  finalizeRecord,
  findDuplicates,
  getLatestExtractions,
  getRecord,
  getVersions,
  listCurrentDocuments,
  listRecords,
  purgeRecord,
  restoreRecord,
  rowToValues,
  saveDraftData,
  updateRecord,
} from "@/server/services/records";
import { storage } from "@/server/storage";
import { FICTICIO, writeFixtures, type FixtureSet } from "../fixtures/documents";
import { makeUser, resetDatabase } from "./helpers";

let files: FixtureSet;
let operador: SessionUser;
let admin: SessionUser;

async function upload(kind: RecordKind, id: string, docType: DocType, file: string, user = operador, replaceId?: string) {
  return uploadDocument({ kind, recordId: id, docType, fileName: path.basename(file), buffer: await readFile(file), user, replaceId });
}

async function pdfText(buf: Buffer) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

/** Simula o que o assistente faz no navegador: aplica as sugestões da IA. */
async function autoFill(kind: RecordKind, id: string) {
  const ex = await getLatestExtractions(kind, id);
  const row = (await getRecord(kind, id))!;
  return applyProposals(rowToValues(kind, row), {}, buildProposals(kind, ex));
}

beforeAll(async () => {
  await resetDatabase();
  files = await writeFixtures(path.resolve("test-results/fixtures-int"));
  operador = await makeUser("operador", "Operadora de Testes");
  admin = await makeUser("admin", "Admin de Testes");
}, 120000);

afterAll(async () => {
  await closeBrowser();
});

describe("cadastro de motorista (fluxo completo)", () => {
  let id: string;

  it("cria rascunho e recebe os documentos validados", async () => {
    id = await createDraft("driver", operador);
    await upload("driver", id, "cnh", files.cnhPdf);
    await upload("driver", id, "comprovante_residencia", files.comprovantePng);
    await upload("driver", id, "dados_bancarios", files.bancoJpg);
    const docs = await listCurrentDocuments("driver", id);
    expect(docs.map((d) => d.docType)).toEqual(["cnh", "comprovante_residencia", "dados_bancarios"]);
    // Original armazenado criptografado e recuperável sem alteração
    const raw = await readFile(path.resolve(process.env.STORAGE_LOCAL_DIR!, docs[0].storageKey));
    expect(raw.subarray(0, 6).toString()).toBe("AFENC1");
    expect((await storage().get(docs[0].storageKey)).equals(await readFile(files.cnhPdf))).toBe(true);
    await expect(upload("driver", id, "cnh", files.cnhPdf)).rejects.toThrow(/já foi enviado/);
  });

  it("processa os documentos, classifica e extrai os campos", async () => {
    const { events, extractions } = await processAndCollect({ kind: "driver", recordId: id, user: operador });
    expect(events[0]).toMatchObject({ type: "start" });
    expect(events.filter((e) => e.type === "stage" && e.stage === "concluido")).toHaveLength(3);
    expect(extractions).toHaveLength(3);
    const cnh = extractions.find((e) => e.docType === "cnh")!;
    expect(cnh.matchesExpected).toBe(true);
    expect(cnh.fields.cpf.value).toBe(FICTICIO.motorista.cpf);
    expect(cnh.fields.nome.value).toBe(FICTICIO.motorista.nome);
    const comp = extractions.find((e) => e.docType === "comprovante_residencia")!;
    expect(comp.fields.cep.value).toBe("13010100");
    const docs = await listCurrentDocuments("driver", id);
    expect(docs.every((d) => d.processingStatus === "processado")).toBe(true);
  }, 120000);

  it("conferência: usuário corrige e completa; ficha é salva e PDF gerado com originais", async () => {
    const filled = await autoFill("driver", id);
    expect(filled.values.nome).toBe(FICTICIO.motorista.nome);
    expect(filled.values.cnhValidade).toBe("2031-08-20");
    expect(filled.meta.cpf.source?.docType).toBe("cnh");
    const values = { ...filled.values, telefonePrincipal: "(11) 98888-7777", contatoComercialNome: "Fulano", titularVinculo: "motorista", enderecoVinculo: "proprio" };
    await saveDraftData("driver", id, values, filled.meta, [], operador);
    const status = await finalizeRecord("driver", id, values, filled.meta, [], operador, { allowMissingDocs: false });
    expect(status).toBe("completo");
    const pdf = await generateFicha("driver", id, operador);
    expect(pdf.version).toBe(1);

    const row = (await getRecord("driver", id))!;
    const buf = await storage().get(row.pdfStorageKey!);
    const doc = await PDFDocument.load(buf);
    // ficha (1) + CNH (1) + comprovante (1) + página bancária (1) + banco (1)
    expect(doc.getPageCount()).toBe(5);
    const text = await pdfText(buf);
    expect(text).toContain("FICHA CADASTRAL DE MOTORISTA");
    expect(text).toContain(formatCPF(FICTICIO.motorista.cpf));
    expect(text).toContain("DOCUMENTO FICTÍCIO PARA TESTES"); // página original da CNH preservada
    expect(text).toContain("Transportadora Fictícia de Testes".toUpperCase());
  }, 120000);

  it("bloqueia duplicidade por CPF", async () => {
    const dup = await createDraft("driver", operador);
    const found = await findDuplicates("driver", { cpf: FICTICIO.motorista.cpf }, dup);
    expect(found.map((f) => f.id)).toContain(id);
    await upload("driver", dup, "cnh", files.cnhPdf);
    await expect(finalizeRecord("driver", dup, { cpf: FICTICIO.motorista.cpf, nome: "OUTRO" }, {}, [], operador, { allowMissingDocs: true })).rejects.toThrow(/mesmo identificador/);
    await purgeRecord("driver", dup, admin);
  });

  it("editar um campo preserva os demais, gera versão e o PDF reflete o dado salvo", async () => {
    const before = rowToValues("driver", (await getRecord("driver", id))!);
    const res = await updateRecord("driver", id, { telefoneSecundario: "(11) 97777-6666", contatoOperacionalNome: "Ciclano" }, operador, { reason: "Teste" });
    expect(res.changed.sort()).toEqual(["contatoOperacionalNome", "telefoneSecundario"]);
    expect(res.version).toBe(2);
    const after = rowToValues("driver", (await getRecord("driver", id))!);
    for (const k of Object.keys(before)) if (!res.changed.includes(k)) expect(after[k]).toBe(before[k]);
    expect((await getRecord("driver", id))!.pdfStale).toBe(true);

    const pdf = await generateFicha("driver", id, operador);
    expect(pdf.version).toBe(2);
    const text = await pdfText(await storage().get((await getRecord("driver", id))!.pdfStorageKey!));
    expect(text).toContain("(11) 97777-6666 / Ciclano (operacional)");
    const versions = await getVersions("driver", id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.every((v) => v.pdfStorageKey)).toBe(true); // versões anteriores do PDF preservadas
  }, 60000);

  it("substituir somente a CNH e reprocessar atualiza apenas os campos da CNH", async () => {
    const cnh = (await listCurrentDocuments("driver", id)).find((d) => d.docType === "cnh")!;
    await upload("driver", id, "cnh", files.cnhNovaPdf, operador, cnh.id);
    const current = await listCurrentDocuments("driver", id);
    expect(current.filter((d) => d.docType === "cnh")).toHaveLength(1);
    expect(current).toHaveLength(3);
    const oldDoc = await db.select().from(documents).where(eq(documents.id, cnh.id));
    expect(oldDoc[0].supersededAt).not.toBeNull(); // mantido no histórico

    const extractionsBefore = await db.select().from(extractionResults).where(eq(extractionResults.driverId, id));
    const { extractions } = await processAndCollect({ kind: "driver", recordId: id, docTypes: ["cnh"], user: operador });
    const extractionsAfter = await db.select().from(extractionResults).where(eq(extractionResults.driverId, id));
    expect(extractionsAfter.length).toBe(extractionsBefore.length + 1); // somente a CNH reprocessada

    const values = rowToValues("driver", (await getRecord("driver", id))!);
    const proposals = buildProposals("driver", extractions);
    const scoped = Object.fromEntries(Object.entries(proposals).filter(([, p]) => p.meta.source?.docType === "cnh"));
    const diffs = diffProposals(values, scoped);
    expect(diffs.map((d) => d.key)).toEqual(["cnhValidade"]);
    await updateRecord("driver", id, { cnhValidade: diffs[0].proposed }, operador, { reason: "Reprocessamento CNH" });
    const after = rowToValues("driver", (await getRecord("driver", id))!);
    expect(after.cnhValidade).toBe("2036-08-20");
    expect(after.telefoneSecundario).toBe("11977776666"); // dado conferido preservado
    expect(after.cep).toBe(values.cep);
  }, 120000);

  it("dashboard usa dados reais do banco", async () => {
    const d = await dashboardData();
    expect(d.totals.drivers).toBe(1);
    expect(d.recent).toBe(1);
    expect(d.activity[0]).toMatchObject({ kind: "driver", id, title: FICTICIO.motorista.nome });
  });

  it("pesquisa e filtros por situação", async () => {
    expect((await listRecords("driver", { q: "fictício" })).total).toBe(0);
    expect((await listRecords("driver", { q: "TESTE FICTICIO" })).total).toBe(1);
    expect((await listRecords("driver", { q: FICTICIO.motorista.cpf.slice(3, 9) })).total).toBe(1);
    expect((await listRecords("driver", { status: "completo" })).total).toBe(1);
    expect((await listRecords("driver", { status: "vencido" })).total).toBe(0);
    await updateRecord("driver", id, { cnhValidade: "2020-01-01" }, operador);
    expect((await listRecords("driver", { status: "vencido" })).total).toBe(1);
    expect((await listRecords("driver", { status: "completo" })).total).toBe(0);
    const d = await dashboardData();
    expect(d.vencidos).toBe(1);
    expect(d.expiring[0]).toMatchObject({ id, state: "vencido" });
  });

  it("exclusão segura: lixeira, restauração e remoção definitiva dos arquivos", async () => {
    const row = (await getRecord("driver", id))!;
    const keys = (await db.select().from(documents).where(eq(documents.driverId, id))).map((d) => d.storageKey);
    await archiveRecord("driver", id, admin);
    expect(await getRecord("driver", id)).toBeNull();
    expect((await listRecords("driver", {})).total).toBe(0);
    expect((await listRecords("driver", { archived: true })).total).toBe(1);
    await restoreRecord("driver", id, admin);
    expect(await getRecord("driver", id)).not.toBeNull();
    await archiveRecord("driver", id, admin);
    const removed = await purgeRecord("driver", id, admin);
    expect(removed).toBeGreaterThanOrEqual(keys.length + 1);
    for (const k of [...keys, row.pdfStorageKey!]) expect(await storage().exists(k)).toBe(false);
    expect(await db.select().from(documents).where(eq(documents.driverId, id))).toHaveLength(0);
  });

  it("logs de auditoria não contêm CPF nem dados bancários", async () => {
    const logs = await db.select().from(auditLogs);
    expect(logs.length).toBeGreaterThan(5);
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain(FICTICIO.motorista.cpf);
    expect(dump).not.toContain("98765");
    expect(dump).not.toContain("teste.ficticio");
  });
});

describe("cadastro de veículo (fluxo completo)", () => {
  it("processa CRLV, ANTT e foto; gera ficha com documentos originais", async () => {
    const id = await createDraft("vehicle", operador);
    await upload("vehicle", id, "crlv", files.crlvPdf);
    await upload("vehicle", id, "antt", files.anttPdf);
    await upload("vehicle", id, "foto_veiculo", files.fotoJpg);
    const { extractions } = await processAndCollect({ kind: "vehicle", recordId: id, user: operador });
    expect(extractions.find((e) => e.docType === "crlv")!.fields.placa.value).toBe("TST1A23");
    expect(extractions.find((e) => e.docType === "antt")!.fields.rntrc.value).toBe("012345678");
    const foto = extractions.find((e) => e.docType === "foto_veiculo")!;
    expect(foto.warnings.join(" ")).toMatch(/multimodal/); // OCR local não inventa análise visual

    const filled = await autoFill("vehicle", id);
    expect(filled.values.renavam).toBe(FICTICIO.veiculo.renavam);
    expect(filled.values.capacidadeCargaKg).toBe("14500");
    expect(filled.values.proprietarioDocumento).toBe(FICTICIO.veiculo.cnpj);
    expect(filled.values.tipoVeiculo).toBe(""); // sem sugestão visual → fica vazio para preenchimento manual
    const values = { ...filled.values, tipoVeiculo: "Caminhão rígido", tipoRodado: "Truck", cubagemM3: "48", tagPedagioOperadora: "Sem Parar", tagPedagioNumero: "1234567890123" };
    expect(await finalizeRecord("vehicle", id, values, filled.meta, [], operador, { allowMissingDocs: false })).toBe("completo");
    await generateFicha("vehicle", id, operador);
    const row = (await getRecord("vehicle", id))!;
    const buf = await storage().get(row.pdfStorageKey!);
    expect((await PDFDocument.load(buf)).getPageCount()).toBe(4); // ficha + CRLV + ANTT + foto
    const text = await pdfText(buf);
    expect(text).toContain("FICHA CADASTRAL DE VEÍCULO");
    expect(text).toContain("TST1A23");
    expect(text).toContain("14.500 kg");
    expect(text).toContain("Sem Parar");
    expect((await findDuplicates("vehicle", { renavam: FICTICIO.veiculo.renavam })).length).toBe(1);
  }, 120000);

  it("documento ilegível e documento do tipo errado são identificados", async () => {
    const id = await createDraft("vehicle", operador);
    await upload("vehicle", id, "crlv", files.ilegivelJpg);
    await upload("vehicle", id, "antt", files.crlvPdf);
    const { events } = await processAndCollect({ kind: "vehicle", recordId: id, user: operador });
    const errors = events.filter((e) => e.type === "doc_error");
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ docType: "crlv", code: "ilegivel" }),
        expect.objectContaining({ docType: "antt", code: "incompativel" }),
      ]),
    );
    const docs = await db.select().from(documents).where(and(eq(documents.vehicleId, id)));
    expect(docs.map((d) => d.processingStatus).sort()).toEqual(["ilegivel", "incompativel"]);
  }, 120000);

  it("sem provedor configurado, informa claramente e não simula extração", async () => {
    const id = await createDraft("vehicle", operador);
    await upload("vehicle", id, "crlv", files.crlvPdf);
    const { events, extractions } = await processAndCollect({ kind: "vehicle", recordId: id, user: operador, provider: null });
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "ai_not_configured" })]);
    expect(extractions).toEqual([]);
  });

  it("provedor externo exige autorização do administrador (LGPD)", async () => {
    const id = await createDraft("vehicle", operador);
    await upload("vehicle", id, "crlv", files.crlvPdf);
    const external = { id: "anthropic" as const, label: "Externo", external: true, model: "x", extract: async () => { throw new Error("não deveria ser chamado"); } };
    const { events } = await processAndCollect({ kind: "vehicle", recordId: id, user: operador, provider: external });
    expect(events[0]).toMatchObject({ type: "error", code: "external_disabled" });
  });
});
