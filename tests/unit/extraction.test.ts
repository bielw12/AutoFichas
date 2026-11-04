import { describe, expect, it } from "vitest";
import type { DocType } from "@/lib/doc-types";
import { getDocSchema } from "@/lib/extraction-schemas";
import type { ExtractionSummary } from "@/lib/extraction-types";
import { detectInconsistencies, unresolvedErrors } from "@/lib/inconsistencies";
import { applyProposals, applyTransform, buildProposals, diffProposals } from "@/lib/merge";
import { fixNumeric, normalizeExtracted, validateInput } from "@/lib/normalize";
import { postProcess } from "@/server/ai/postprocess";
import type { ProviderOutput } from "@/server/ai/types";
import { cpfWithDv } from "../fixtures/documents";

const CPF = cpfWithDv("123456789");

function provider(fields: Record<string, [string | null, number]>, extra: Partial<ProviderOutput> = {}): ProviderOutput {
  return {
    documentTypeDetected: null,
    matchesExpected: true,
    legibility: "boa",
    warnings: [],
    model: "teste",
    fields: Object.fromEntries(Object.entries(fields).map(([k, [value, confidence]]) => [k, { value, confidence }])),
    ...extra,
  };
}

function summary(docType: DocType, out: ProviderOutput, id = `ex-${docType}`): ExtractionSummary {
  const pp = postProcess(docType, getDocSchema(docType)!, out);
  return { id, docType, documentIds: [`doc-${docType}`], provider: "teste", model: "teste", error: null, createdAt: new Date().toISOString(), ...pp };
}

describe("normalização de valores extraídos", () => {
  it("converte letras ambíguas em dígitos e sinaliza ajuste", () => {
    expect(fixNumeric("1O3.4S6.7B9-0I")).toEqual({ value: "10345678901", adjusted: true });
    const n = normalizeExtracted("cpf", "123.456.789-O9");
    expect(n.value).toBe("12345678909");
    expect(n.adjusted).toBe(true);
  });

  it("nunca inventa valor para campo vazio ou ilegível", () => {
    for (const raw of [null, "", "   ", "ilegível", "N/A", "não consta"]) {
      expect(normalizeExtracted("text", raw).value).toBeNull();
    }
  });

  it("rejeita data malformada sem adivinhar", () => {
    const n = normalizeExtracted("date", "32/13/2020");
    expect(n.value).toBeNull();
    expect(n.valid).toBe(false);
  });

  it("valida campos do formulário", () => {
    expect(validateInput({ input: "cpf" }, "12345678900")).toMatch(/CPF/);
    expect(validateInput({ input: "cpf" }, CPF)).toBeNull();
    expect(validateInput({ input: "placa" }, "ABC1D23")).toBeNull();
    expect(validateInput({ input: "date" }, "2024-02-30")).toMatch(/Data/);
    expect(validateInput({ input: "cep" }, "")).toBeNull();
  });
});

describe("níveis de confiança (verde/amarelo/vermelho)", () => {
  const schema = getDocSchema("cnh")!;

  it("alta confiança + formato válido = verde; baixa = amarelo; ausente = vermelho", () => {
    const pp = postProcess("cnh", schema, provider({ nome: ["FULANO FICTICIO", 0.97], cpf: [CPF, 0.6], categoria: [null, 0] }));
    expect(pp.fields.nome.status).toBe("high");
    expect(pp.fields.cpf.status).toBe("review");
    expect(pp.fields.categoria.status).toBe("missing");
    expect(pp.missingFields).toContain("categoria");
    expect(pp.missingFields).toContain("rg"); // não devolvido pelo provedor
  });

  it("CPF com dígito inválido é marcado como inconsistente (vermelho)", () => {
    const pp = postProcess("cnh", schema, provider({ cpf: ["12345678900", 0.99] }));
    expect(pp.fields.cpf.status).toBe("conflict");
    expect(pp.fields.cpf.notes.join(" ")).toMatch(/CPF/);
  });

  it("caracteres ajustados exigem conferência mesmo com confiança alta", () => {
    const pp = postProcess("cnh", schema, provider({ cpf: ["123.456.789-O9", 0.99] }));
    expect(pp.fields.cpf.status).toBe("review");
    expect(pp.fields.cpf.value).toBe("12345678909");
  });

  it("provedor heurístico nunca gera verde automático", () => {
    const pp = postProcess("cnh", schema, provider({ nome: ["FULANO FICTICIO", 0.99] }, { maxConfidence: 0.75 }));
    expect(pp.fields.nome.status).toBe("review");
  });

  it("documento ilegível e documento incompatível são sinalizados", () => {
    const il = postProcess("cnh", schema, provider({}, { legibility: "ilegivel" }));
    expect(il.warnings.join(" ")).toMatch(/ilegível/i);
    const inc = postProcess("cnh", schema, provider({}, { documentTypeDetected: "crlv", matchesExpected: true }));
    expect(inc.matchesExpected).toBe(false);
  });
});

describe("mesclagem das sugestões no formulário", () => {
  it("preenche a ficha a partir das extrações com origem registrada", () => {
    const cnh = summary("cnh", provider({ nome: ["FULANO FICTICIO", 0.98], cpf: [CPF, 0.97], data_validade: ["20/08/2031", 0.95] }));
    const p = buildProposals("driver", [cnh]);
    expect(p.nome.value).toBe("FULANO FICTICIO");
    expect(p.nome.meta.status).toBe("high");
    expect(p.nome.meta.source?.docType).toBe("cnh");
    expect(p.cnhValidade.value).toBe("2031-08-20");
    expect(p.rg.meta.status).toBe("missing");
    expect(p.rg.value).toBe("");
  });

  it("endereço do comprovante sempre exige conferência", () => {
    const comp = summary("comprovante_residencia", provider({ cep: ["13010-100", 0.99], logradouro: ["RUA FICTICIA", 0.99] }));
    const p = buildProposals("driver", [comp]);
    expect(p.cep.meta.status).toBe("review");
    expect(p.logradouro.meta.notes?.join(" ")).toMatch(/comprovante/i);
  });

  it("não sobrescreve campos editados pelo usuário", () => {
    const cnh = summary("cnh", provider({ nome: ["NOME DA IA", 0.99] }));
    const p = buildProposals("driver", [cnh]);
    const res = applyProposals({ nome: "NOME CORRIGIDO" }, { nome: { status: "manual" } }, p);
    expect(res.values.nome).toBe("NOME CORRIGIDO");
    expect(res.meta.nome.status).toBe("manual");
  });

  it("não apaga valor existente quando o novo documento não traz o dado", () => {
    const cnh = summary("cnh", provider({ nome: [null, 0] }));
    const res = applyProposals({ nome: "VALOR ANTERIOR" }, { nome: { status: "high" } }, buildProposals("driver", [cnh]));
    expect(res.values.nome).toBe("VALOR ANTERIOR");
  });

  it("converte capacidade em toneladas para kg e lista diferenças no reprocessamento", () => {
    expect(applyTransform("tonsToKg", "14.5T").value).toBe("14500");
    expect(applyTransform("tonsToKg", "14500 KG").value).toBe("14500");
    const crlv = summary("crlv", provider({ placa: ["ABC1D23", 0.99], capacidade: ["14,5 T", 0.9] }));
    const p = buildProposals("vehicle", [crlv]);
    expect(p.capacidadeCargaKg.value).toBe("14500");
    expect(p.capacidadeCargaKg.meta.status).toBe("review");
    const diffs = diffProposals({ placa: "ABC1D23", capacidadeCargaKg: "15000" }, p);
    expect(diffs.map((d) => d.key)).toEqual(["capacidadeCargaKg"]);
  });
});

describe("detecção de inconsistências entre documentos", () => {
  it("aponta CPF divergente entre formulário e CNH", () => {
    const cnh = summary("cnh", provider({ cpf: [CPF, 0.99] }));
    const issues = detectInconsistencies("driver", { cpf: cpfWithDv("987654321") }, [cnh]);
    expect(issues.find((i) => i.id.startsWith("cpf-cnh"))?.severity).toBe("error");
    expect(unresolvedErrors(issues, [])).toHaveLength(1);
    expect(unresolvedErrors(issues, issues.map((i) => i.id))).toHaveLength(0);
  });

  it("aponta dados bancários do motorista com CPF de outra pessoa", () => {
    const issues = detectInconsistencies("driver", { cpf: CPF, titularDocumento: cpfWithDv("111222333"), titularVinculo: "motorista" }, []);
    expect(issues.some((i) => i.id.startsWith("cpf-banco") && i.severity === "error")).toBe(true);
  });

  it("aponta placa divergente entre CRLV e ANTT", () => {
    const crlv = summary("crlv", provider({ placa: ["ABC1D23", 0.99] }));
    const antt = summary("antt", provider({ placa: ["XYZ9K87", 0.9] }));
    const issues = detectInconsistencies("vehicle", { placa: "ABC1D23" }, [crlv, antt]);
    expect(issues.some((i) => i.id.startsWith("placa-antt"))).toBe(true);
    expect(issues.some((i) => i.id.startsWith("placa-crlv"))).toBe(false);
  });

  it("aponta documento incompatível e ilegível", () => {
    const wrong = summary("cnh", provider({}, { documentTypeDetected: "crlv" }));
    const bad = summary("crlv", provider({}, { legibility: "ilegivel" }));
    const issues = detectInconsistencies("driver", {}, [wrong, bad]);
    expect(issues.some((i) => i.id.startsWith("doc-incompativel"))).toBe(true);
    expect(issues.some((i) => i.id.startsWith("doc-ilegivel"))).toBe(true);
  });
});
