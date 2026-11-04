import { describe, expect, it } from "vitest";
import { getDocSchema } from "@/lib/extraction-schemas";
import { buildJsonSchema } from "@/server/ai/prompt";
import { AnthropicProvider } from "@/server/ai/providers/anthropic";
import { classifyText, parseAntt, parseBanco, parseCnh, parseComprovante, parseCrlv } from "@/server/ai/providers/local-parsers";
import { OpenAIProvider } from "@/server/ai/providers/openai";
import { ProviderError } from "@/server/ai/types";

const schema = getDocSchema("cnh")!;
const pdf = { name: "cnh.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 teste") };

function fakeResult() {
  return {
    document_type_detected: "cnh",
    matches_expected: true,
    legibility: "boa",
    fields: Object.fromEntries(schema.fields.map((f) => [f.key, { value: f.key === "nome" ? "FULANO FICTICIO" : null, confidence: f.key === "nome" ? 0.95 : 0 }])),
    warnings: [],
  };
}

describe("schemas estruturados", () => {
  it("gera JSON Schema estrito com todos os campos obrigatórios e anuláveis", () => {
    const js = buildJsonSchema(schema) as { required: string[]; properties: { fields: { required: string[]; properties: Record<string, { properties: { value: { type: string[] } } }> } } };
    expect(js.required).toEqual(["document_type_detected", "matches_expected", "legibility", "fields", "warnings"]);
    expect(js.properties.fields.required).toEqual(schema.fields.map((f) => f.key));
    expect(js.properties.fields.properties.cpf.properties.value.type).toEqual(["string", "null"]);
  });
});

describe("provedor Anthropic (Claude)", () => {
  it("envia o PDF como bloco de documento e força a ferramenta estruturada", async () => {
    let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
    const p = new AnthropicProvider("chave-teste", "claude-teste", async (url, headers, body) => {
      sent = { url, headers, body: body as Record<string, unknown> };
      return { model: "claude-teste", content: [{ type: "tool_use", name: "registrar_extracao", input: fakeResult() }] };
    });
    const out = await p.extract({ expectedType: "cnh", schema, files: [pdf] });
    expect(sent!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent!.headers["x-api-key"]).toBe("chave-teste");
    expect((sent!.body.tool_choice as { name: string }).name).toBe("registrar_extracao");
    const content = (sent!.body.messages as { content: { type: string }[] }[])[0].content;
    expect(content[0].type).toBe("document");
    expect(out.fields.nome).toEqual({ value: "FULANO FICTICIO", confidence: 0.95 });
    expect(out.fields.cpf.value).toBeNull();
  });

  it("falha de forma explícita quando a resposta não é estruturada", async () => {
    const p = new AnthropicProvider("k", "m", async () => ({ content: [{ type: "text", text: "não sei" }] }));
    await expect(p.extract({ expectedType: "cnh", schema, files: [pdf] })).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("provedor OpenAI", () => {
  it("usa structured outputs e envia PDF como arquivo", async () => {
    let body: Record<string, unknown> = {};
    const p = new OpenAIProvider("k", "gpt-teste", async (_u, _h, b) => {
      body = b as Record<string, unknown>;
      return { model: "gpt-teste", choices: [{ message: { content: JSON.stringify(fakeResult()) } }] };
    });
    const out = await p.extract({ expectedType: "cnh", schema, files: [pdf] });
    expect((body.response_format as { type: string }).type).toBe("json_schema");
    const content = (body.messages as { content: unknown }[])[1].content as { type: string }[];
    expect(content.some((c) => c.type === "file")).toBe(true);
    expect(out.fields.nome.value).toBe("FULANO FICTICIO");
  });

  it("trata recusa do modelo", async () => {
    const p = new OpenAIProvider("k", "m", async () => ({ choices: [{ message: { content: null, refusal: "recusado" } }] }));
    await expect(p.extract({ expectedType: "cnh", schema, files: [pdf] })).rejects.toThrow(/recusou/);
  });
});

describe("OCR local — interpretação por regras", () => {
  it("classifica documentos pelo conteúdo", () => {
    expect(classifyText("CARTEIRA NACIONAL DE HABILITAÇÃO\nCAT. HAB. B").type).toBe("cnh");
    expect(classifyText("CERTIFICADO DE REGISTRO E LICENCIAMENTO\nRENAVAM 123\nCHASSI").type).toBe("crlv");
    expect(classifyText("ANTT\nRNTRC 123").type).toBe("antt");
    expect(classifyText("texto qualquer").type).toBeNull();
  });

  it("extrai campos da CNH por rótulos", () => {
    const f = parseCnh("CARTEIRA NACIONAL DE HABILITAÇÃO\nNOME\nFULANO DE TESTE\nCPF\n123.456.789-09\nVALIDADE\n10/10/2030\nCAT. HAB.\nAE\nNº REGISTRO\n12345678900");
    expect(f.nome.value).toBe("FULANO DE TESTE");
    expect(f.cpf.value).toBe("12345678909");
    expect(f.data_validade.value).toBe("10/10/2030");
    expect(f.categoria.value).toBe("AE");
    expect(f.registro.value).toBe("12345678900");
  });

  it("extrai endereço, banco, CRLV e ANTT", () => {
    const c = parseComprovante("CONTA DE ENERGIA\nCliente: FULANO DE TESTE\nRUA DAS PALMEIRAS, 45 - APTO 12\nBairro: JARDIM\nCEP 01001-000\nSAO PAULO - SP");
    expect(c).toMatchObject({ logradouro: { value: "RUA DAS PALMEIRAS" }, numero: { value: "45" }, complemento: { value: "APTO 12" }, cep: { value: "01001000" }, uf: { value: "SP" } });
    const b = parseBanco("Banco: Itaú\nAgência: 0001\nConta Corrente: 12345-6\nChave PIX: 11988887777");
    expect(b.conta.value).toBe("12345");
    expect(b.conta_digito.value).toBe("6");
    expect(b.tipo_conta.value).toBe("corrente");
    const v = parseCrlv("PLACA\nABC1D23\nRENAVAM\n01234567897\nMARCA / MODELO / VERSÃO\nVOLVO/FH 540\nCPF / CNPJ\n12345678000195");
    expect(v.placa.value).toBe("ABC1D23");
    expect(v.marca.value).toBe("VOLVO");
    expect(v.proprietario_documento.value).toBe("12345678000195");
    const a = parseAntt("ANTT\nRNTRC: 012345678\nTransportador Autônomo de Cargas\nSituação: ATIVO");
    expect(a.rntrc.value).toBe("012345678");
    expect(a.tipo_transportador.value).toBe("TAC");
    expect(a.situacao.value).toBe("ATIVO");
  });
});
