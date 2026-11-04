import { describe, expect, it } from "vitest";
import { formatCPF, formatPlaca, maskCPF, maskCpfCnpj, maskPix } from "@/lib/format";
import {
  isValidCEP,
  isValidChassi,
  isValidCNPJ,
  isValidCPF,
  isValidPhone,
  isValidPlaca,
  isValidRenavam,
  nameSimilarity,
  normalizePlaca,
  parseDateToISO,
} from "@/lib/validators";
import { cnpjWithDv, cpfWithDv, renavamWithDv } from "../fixtures/documents";

describe("validações de formato", () => {
  it("valida CPF pelos dígitos verificadores", () => {
    const cpf = cpfWithDv("123456789");
    expect(isValidCPF(cpf)).toBe(true);
    expect(isValidCPF(formatCPF(cpf))).toBe(true);
    expect(isValidCPF("12345678900")).toBe(false);
    expect(isValidCPF("11111111111")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
  });

  it("valida CNPJ", () => {
    expect(isValidCNPJ(cnpjWithDv("123456780001"))).toBe(true);
    expect(isValidCNPJ("12345678000100")).toBe(false);
  });

  it("valida placas no padrão antigo e Mercosul", () => {
    expect(isValidPlaca("ABC1234")).toBe(true);
    expect(isValidPlaca("ABC-1234")).toBe(true);
    expect(isValidPlaca("ABC1D23")).toBe(true);
    expect(isValidPlaca("AB1C234")).toBe(false);
  });

  it("corrige confusões de OCR na placa somente pela posição", () => {
    expect(normalizePlaca("A8C1D23")).toEqual({ value: "ABC1D23", adjusted: true });
    expect(normalizePlaca("ABCID2S")).toEqual({ value: "ABC1D25", adjusted: true });
    expect(normalizePlaca("ABC1D23")).toEqual({ value: "ABC1D23", adjusted: false });
  });

  it("valida Renavam e chassi", () => {
    expect(isValidRenavam(renavamWithDv("0123456789"))).toBe(true);
    expect(isValidRenavam("01234567890")).toBe(renavamWithDv("0123456789") === "01234567890");
    expect(isValidChassi("9BWZZZ377VT004251")).toBe(true);
    expect(isValidChassi("9BWZZZ377VT00425I")).toBe(false); // I não é permitido
  });

  it("valida CEP e telefone", () => {
    expect(isValidCEP("13010-100")).toBe(true);
    expect(isValidCEP("00000000")).toBe(false);
    expect(isValidPhone("(11) 98888-7777")).toBe(true);
    expect(isValidPhone("(11) 3888-7777")).toBe(true);
    expect(isValidPhone("+55 11 98888-7777")).toBe(true);
    expect(isValidPhone("(11) 88888-7777")).toBe(false);
  });

  it("interpreta datas brasileiras sem ambiguidade", () => {
    expect(parseDateToISO("05/03/2024")).toBe("2024-03-05");
    expect(parseDateToISO("5-3-2024")).toBe("2024-03-05");
    expect(parseDateToISO("2024-03-05")).toBe("2024-03-05");
    expect(parseDateToISO("31/02/2024")).toBeNull();
    expect(parseDateToISO("março de 2024")).toBeNull();
  });

  it("compara nomes ignorando acentos e preposições", () => {
    expect(nameSimilarity("João da Silva", "JOAO SILVA")).toBe(1);
    expect(nameSimilarity("Maria Souza", "Pedro Lima")).toBe(0);
  });
});

describe("máscaras de dados sensíveis", () => {
  it("mascara CPF, CNPJ e chave PIX", () => {
    expect(maskCPF("12345678909")).toBe("•••.456.789-••");
    expect(maskCpfCnpj(cnpjWithDv("123456780001"))).toMatch(/^12\.345\.•••\/••••-\d{2}$/);
    expect(maskPix("pessoa@example.com", "email")).toBe("pe•••@example.com");
    expect(formatPlaca("ABC1234")).toBe("ABC-1234");
  });
});
