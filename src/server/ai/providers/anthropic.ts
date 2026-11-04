import "server-only";
import { toAiImage } from "../../files/images";
import { buildJsonSchema, providerResultSchema, SYSTEM_PROMPT, TOOL_NAME, userInstruction } from "../prompt";
import { ProviderError, type ExtractionProvider, type ProviderInput, type ProviderOutput } from "../types";
import { postJson } from "./http";

/**
 * Claude (Anthropic Messages API). Lê PDFs (inclusive digitalizados) e imagens
 * nativamente; a resposta estruturada é obtida forçando o uso de uma ferramenta
 * cujo input_schema é o schema do documento.
 */
export class AnthropicProvider implements ExtractionProvider {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic Claude";
  readonly external = true;
  readonly model: string;

  constructor(
    private apiKey: string,
    model?: string,
    private fetcher: typeof postJson = postJson,
  ) {
    this.model = model || "claude-sonnet-5-5";
  }

  async buildContent(input: ProviderInput) {
    const content: unknown[] = [];
    for (const f of input.files) {
      if (f.mime === "application/pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: f.data.toString("base64") },
          title: f.name,
        });
      } else {
        const img = await toAiImage(f.data, f.mime);
        content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.data.toString("base64") } });
      }
    }
    content.push({ type: "text", text: userInstruction(input.schema) });
    return content;
  }

  async extract(input: ProviderInput): Promise<ProviderOutput> {
    const body = {
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Registra os dados extraídos do documento, campo a campo, com confiança.",
          input_schema: buildJsonSchema(input.schema),
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: await this.buildContent(input) }],
    };
    const res = (await this.fetcher(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body,
      "Anthropic",
      input.signal,
    )) as { content?: { type: string; name?: string; input?: unknown }[]; model?: string; stop_reason?: string };

    const block = res.content?.find((c) => c.type === "tool_use" && c.name === TOOL_NAME);
    if (!block) {
      throw new ProviderError(
        res.stop_reason === "refusal" ? "O provedor de IA recusou o processamento deste documento." : "Resposta do provedor sem dados estruturados.",
      );
    }
    return toOutput(block.input, res.model ?? this.model);
  }
}

export function toOutput(raw: unknown, model: string | null): ProviderOutput {
  const parsed = providerResultSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError("Resposta do provedor fora do formato esperado.");
  const fields: ProviderOutput["fields"] = {};
  for (const [k, v] of Object.entries(parsed.data.fields)) {
    fields[k] = v ? { value: v.value, confidence: v.confidence } : { value: null, confidence: 0 };
  }
  return {
    documentTypeDetected: parsed.data.document_type_detected,
    matchesExpected: parsed.data.matches_expected,
    legibility: parsed.data.legibility,
    fields,
    warnings: parsed.data.warnings.map((w) => w.slice(0, 300)).slice(0, 20),
    model,
  };
}
