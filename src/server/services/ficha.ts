import "server-only";
import { desc, eq } from "drizzle-orm";
import { DOC_ORDER, type DocType, type RecordKind } from "@/lib/doc-types";
import { formatCNPJ, formatDateTimeBR } from "@/lib/format";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { recordVersions, type CompanySettings } from "../db/schema";
import { assembleFicha, type FooterInfo } from "../pdf/assemble";
import { htmlToPdf } from "../pdf/render";
import { bankPageHtml, driverBankData, driverFichaHtml, hasBankData, vehicleFichaHtml, type FichaContext } from "../pdf/templates";
import { storage, storageKeys } from "../storage";
import { listCurrentDocuments, ownerCols, requireRecord, rowToValues, tableFor, valuesToColumns } from "./records";
import { companyBankActive, companyBankData, getLogo, getSettings } from "./settings";

function splitList(s: string): string[] {
  return s
    .split(/[\n;,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function footerFromSettings(settings: CompanySettings, generatedLabel: string): Promise<FooterInfo> {
  return {
    primary: settings.primaryColor,
    accent: settings.accentColor,
    companyName: settings.companyName,
    phones: splitList(settings.phones),
    website: settings.website.trim(),
    emails: splitList(settings.emails),
    smallLines: [settings.cnpj ? `CNPJ ${formatCNPJ(settings.cnpj)}` : "", settings.address, settings.footerText]
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2),
    logo: await getLogo(settings),
    generatedLabel,
  };
}

/**
 * Gera o PDF completo (ficha + documentos originais) a partir dos dados
 * SALVOS no banco, armazena e vincula à versão correspondente.
 */
export async function generateFicha(kind: RecordKind, id: string, user: SessionUser) {
  const row = await requireRecord(kind, id);
  const values = rowToValues(kind, row);
  const settings = await getSettings();
  const docs = await listCurrentDocuments(kind, id);
  const own = ownerCols(kind);

  const [latest] = await db.select().from(recordVersions).where(eq(own.ver, id)).orderBy(desc(recordVersions.version)).limit(1);
  const isDraft = row.isDraft;
  const targetVersion = isDraft ? 0 : !latest ? 1 : latest.pdfStorageKey ? latest.version + 1 : latest.version;

  const now = new Date();
  const ctx: FichaContext = {
    theme: { primary: settings.primaryColor, accent: settings.accentColor },
    generatedAt: formatDateTimeBR(now),
    version: targetVersion,
    generatedBy: user.name,
  };

  const fichaHtml = kind === "driver" ? driverFichaHtml(values, ctx) : vehicleFichaHtml(values, ctx);
  const fichaPdf = await htmlToPdf(fichaHtml);
  const insertBefore: Partial<Record<DocType, Buffer>> = {};
  if (kind === "driver" && settings.includeBankPage) {
    // Dados bancários padrão da transportadora (Configurações) ou, se desativado, os do motorista
    const bank = companyBankActive(settings) ? companyBankData(settings) : hasBankData(values) ? driverBankData(values) : null;
    if (bank) insertBefore.dados_bancarios = await htmlToPdf(bankPageHtml(bank, ctx, settings.companyName));
  }

  const order = DOC_ORDER[kind];
  const sorted = [...docs].sort((a, b) => order.indexOf(a.docType) - order.indexOf(b.docType) || a.position - b.position);
  const attachments = await Promise.all(
    sorted.map(async (d) => ({ docType: d.docType, name: d.originalName, mime: d.mimeType, data: await storage().get(d.storageKey) })),
  );

  const title = kind === "driver" ? `Ficha cadastral de motorista - ${values.nome}` : `Ficha cadastral de veículo - ${values.placa}`;
  const { pdf, pageCount } = await assembleFicha({
    fichaPdf,
    insertBefore,
    attachments,
    footer: await footerFromSettings(settings, `Gerado em ${ctx.generatedAt}${isDraft ? " (prévia)" : ` · v${targetVersion}`}`),
    footerOnDocuments: settings.footerOnDocuments,
    title,
  });

  const key = storageKeys.ficha(kind, id, isDraft ? "previa" : `v${targetVersion}-${now.getTime()}`);
  await storage().put(key, pdf, "application/pdf");

  const t = tableFor(kind);
  if (isDraft && row.pdfStorageKey && row.pdfStorageKey !== key) await storage().delete([row.pdfStorageKey]).catch(() => {});

  if (!isDraft) {
    if (latest && !latest.pdfStorageKey) {
      await db.update(recordVersions).set({ pdfStorageKey: key }).where(eq(recordVersions.id, latest.id));
    } else {
      await db.insert(recordVersions).values({
        recordKind: kind,
        [own.ownerField]: id,
        version: targetVersion,
        data: { values: valuesToColumns(kind, values), documents: docs.map((d) => ({ id: d.id, docType: d.docType, name: d.originalName })) },
        changedFields: [],
        documentChanges: [],
        reason: "Ficha regenerada",
        pdfStorageKey: key,
        createdBy: user.id,
      });
    }
  }
  await db
    .update(t)
    .set({ pdfStorageKey: key, pdfGeneratedAt: now, pdfStale: false, ...(isDraft ? {} : { currentVersion: targetVersion }) })
    .where(eq(t.id, id));

  await audit({ user, action: "pdf.generated", entityType: kind, entityId: id, details: { versao: targetVersion, paginas: pageCount, previa: isDraft } });
  return { key, pageCount, version: targetVersion, size: pdf.length };
}
