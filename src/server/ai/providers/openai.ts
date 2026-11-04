import "server-only";
import { toAiImage } from "../../files/images";
import { buildJsonSchema, SYSTEM_PROMPT, userInstruction } from "../prompt";
import { ProviderError, type ExtractionProvider, type ProviderInput, type ProviderOutput } from "../types";
import { postJson } from "./http";
import { toOutput } from "./anthropic";

/**
 * Modelos multimodais da OpenAI (Chat Completions com Structured Outputs).
 * PDFs são enviados como arquivo; imagens como data URL.
 */
export class OpenAIProvider implements ExtractionProvider {
  readonly id = "openai" as const;
  readonly label = "OpenAI";
  readonly external = true;
  readonly model: string;

  constructor(
    private apiKey: string,
    model?: string,
    private fetcher: typeof postJson = postJson,
  ) {
    this.model = model || "gpt-4.1";
  }

  async extract(input: ProviderInput): Promise<ProviderOutput> {
    const content: unknown[] = [{ type: "text", text: userInstruction(input.schema) }];
    for (const f of input.files) {
      if (f.mime === "application/pdf") {
        content.push({ type: "file", file: { filename: f.name.endsWith(".pdf") ? f.name : `${f.name}.pdf`, file_data: `data:application/pdf;base64,${f.data.toString("base64")}` } });
      } else {
        const img = await toAiImage(f.data, f.mime);
        content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data.toString("base64")}`, detail: "high" } });
      }
    }
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "extracao_documento", strict: true, schema: buildJsonSchema(input.schema) },
      },
    };
    const res = (await this.fetcher(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${this.apiKey}` },
      body,
      "OpenAI",
      input.signal,
    )) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[]; model?: string };

    const msg = res.choices?.[0]?.message;
    if (msg?.refusal) throw new ProviderError("O provedor de IA recusou o processamento deste documento.");
    if (!msg?.content) throw new ProviderError("Resposta do provedor sem conteúdo.");
    let json: unknown;
    try {
      json = JSON.parse(msg.content);
    } catch {
      throw new ProviderError("Resposta do provedor não é um JSON válido.");
    }
    return toOutput(json, res.model ?? this.model);
  }
}
