import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DOC_TYPES } from "@/lib/doc-types";
import { toOcrImage } from "../../files/images";
import { ProviderError, type ExtractionProvider, type ProviderInput, type ProviderOutput } from "../types";
import { classifyText, LOCAL_PARSERS } from "./local-parsers";

const execFileAsync = promisify(execFile);

type TesseractWorker = { recognize(img: Buffer): Promise<{ data: { text: string; confidence: number } }>; terminate(): Promise<unknown> };

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const langPath = process.env.OCR_LANG_PATH || path.join(process.cwd(), "node_modules/@tesseract.js-data/por/4.0.0_best_int");
      const w = await createWorker("por", 1, {
        langPath,
        cachePath: path.join(process.cwd(), ".tesseract-cache"),
        gzip: true,
      });
      return w as unknown as TesseractWorker;
    })().catch((err) => {
      workerPromise = null;
      throw new ProviderError(`OCR local indisponível: ${(err as Error).message}`);
    });
  }
  return workerPromise;
}

async function pdfText(data: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  // Reconstrói linhas: unpdf separa itens por espaço; mantém quebras de linha.
  return (Array.isArray(text) ? text : [text]).join("\n");
}

/** Rasteriza um PDF digitalizado com pdftoppm (poppler), se disponível. */
async function rasterizePdf(data: Buffer, maxPages = 4): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "af-ocr-"));
  try {
    const input = path.join(dir, "in.pdf");
    await writeFile(input, data);
    await execFileAsync("pdftoppm", ["-r", "200", "-png", "-l", String(maxPages), input, path.join(dir, "p")], { timeout: 60000 });
    const files = (await readdir(dir)).filter((f) => f.startsWith("p") && f.endsWith(".png")).sort();
    return Promise.all(files.map((f) => readFile(path.join(dir, f))));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ProviderError("PDF digitalizado sem texto: o OCR local requer o utilitário 'pdftoppm' (poppler-utils) ou um provedor multimodal.");
    }
    throw new ProviderError(`Falha ao converter PDF para imagem: ${(err as Error).message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * OCR local (Tesseract) + interpretação por regras. Nenhum dado sai do
 * servidor. Precisão inferior a modelos multimodais; confiança limitada para
 * forçar conferência humana de todos os campos.
 */
export class LocalOcrProvider implements ExtractionProvider {
  readonly id = "local" as const;
  readonly label = "OCR local (Tesseract)";
  readonly external = false;
  readonly model = "tesseract-por";

  async readText(input: ProviderInput): Promise<{ text: string; ocrConfidence: number }> {
    const parts: string[] = [];
    const confidences: number[] = [];
    for (const f of input.files) {
      if (f.mime === "application/pdf") {
        const t = await pdfText(f.data).catch(() => "");
        if (t.replace(/\s/g, "").length >= 40) {
          parts.push(t);
          confidences.push(95);
          continue;
        }
        for (const img of await rasterizePdf(f.data)) {
          const r = await (await getWorker()).recognize(await toOcrImage(img, "image/png"));
          parts.push(r.data.text);
          confidences.push(r.data.confidence);
        }
      } else {
        const r = await (await getWorker()).recognize(await toOcrImage(f.data, f.mime));
        parts.push(r.data.text);
        confidences.push(r.data.confidence);
      }
    }
    const ocrConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    return { text: parts.join("\n"), ocrConfidence };
  }

  async extract(input: ProviderInput): Promise<ProviderOutput> {
    const fieldsEmpty = Object.fromEntries(input.schema.fields.map((f) => [f.key, { value: null, confidence: 0 }]));

    if (input.expectedType === "foto_veiculo") {
      return {
        documentTypeDetected: "foto_veiculo",
        matchesExpected: true,
        legibility: "boa",
        fields: fieldsEmpty,
        warnings: ["A análise visual da foto requer um provedor multimodal (Anthropic ou OpenAI). Preencha as características manualmente."],
        model: this.model,
        maxConfidence: 0.6,
      };
    }

    const { text, ocrConfidence } = await this.readText(input);
    const chars = text.replace(/\s/g, "").length;
    const legibility = chars < 40 || ocrConfidence < 35 ? "ilegivel" : ocrConfidence < 60 ? "parcial" : "boa";
    const cls = classifyText(text);
    const parser = LOCAL_PARSERS[input.expectedType];
    const parsed = legibility === "ilegivel" || !parser ? {} : parser(text);

    // Penaliza confiança conforme a qualidade do OCR
    const factor = Math.min(1, ocrConfidence / 90);
    const fields: ProviderOutput["fields"] = { ...fieldsEmpty };
    for (const f of input.schema.fields) {
      const p = parsed[f.key];
      if (p?.value) fields[f.key] = { value: p.value, confidence: Math.round(p.confidence * factor * 100) / 100 };
    }

    const warnings: string[] = ["Extração por OCR local e regras: confira todos os campos."];
    if (legibility === "ilegivel") warnings.push("Pouco texto reconhecido — o documento pode estar ilegível, escuro ou cortado.");
    const matchesExpected = cls.type === null || cls.type === input.expectedType || (input.expectedType === "comprovante_residencia" && cls.score < 3);
    if (!matchesExpected) warnings.push(`O conteúdo parece ser de outro documento (${cls.type ? DOC_TYPES[cls.type].shortLabel : "desconhecido"}).`);

    return {
      documentTypeDetected: cls.type ?? "desconhecido",
      matchesExpected,
      legibility,
      fields,
      warnings,
      model: this.model,
      maxConfidence: 0.75,
    };
  }
}
