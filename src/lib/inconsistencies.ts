import type { RecordKind } from "./doc-types";
import { DOC_TYPES } from "./doc-types";
import type { ExtractionSummary } from "./extraction-types";
import type { FormValues } from "./fields";
import { formatCpfCnpj, formatPlaca } from "./format";
import { nameSimilarity, onlyDigits } from "./validators";

export interface Inconsistency {
  /** Identificador estável (permite registrar que o usuário conferiu). */
  id: string;
  severity: "error" | "warning";
  message: string;
  fields: string[];
}

function ex(extractions: ExtractionSummary[], docType: string) {
  return extractions.find((e) => e.docType === docType && !e.error);
}

function val(e: ExtractionSummary | undefined, field: string): string {
  return e?.fields[field]?.value ?? "";
}

/**
 * Detecta divergências entre os dados do formulário e os dados encontrados em
 * outros documentos. Não decide qual valor está correto — apenas sinaliza.
 */
export function detectInconsistencies(kind: RecordKind, v: FormValues, extractions: ExtractionSummary[]): Inconsistency[] {
  const out: Inconsistency[] = [];

  for (const e of extractions) {
    if (e.error) continue;
    if (!e.matchesExpected) {
      out.push({
        id: `doc-incompativel:${e.docType}:${e.id}`,
        severity: "error",
        message: `O arquivo enviado como "${DOC_TYPES[e.docType].shortLabel}" parece ser outro tipo de documento${e.detectedType ? ` (${e.detectedType})` : ""}. Substitua o arquivo ou confirme manualmente.`,
        fields: [],
      });
    }
    if (e.legibility === "ilegivel") {
      out.push({
        id: `doc-ilegivel:${e.docType}:${e.id}`,
        severity: "error",
        message: `"${DOC_TYPES[e.docType].shortLabel}" está ilegível. Envie um novo arquivo com melhor qualidade.`,
        fields: [],
      });
    }
  }

  if (kind === "driver") {
    const cpf = onlyDigits(v.cpf);
    const comp = ex(extractions, "comprovante_residencia");
    const bank = ex(extractions, "dados_bancarios");
    const cnh = ex(extractions, "cnh");

    if (cnh && cpf && val(cnh, "cpf") && onlyDigits(val(cnh, "cpf")) !== cpf) {
      out.push({
        id: `cpf-cnh:${onlyDigits(val(cnh, "cpf"))}:${cpf}`,
        severity: "error",
        message: `O CPF informado (${formatCpfCnpj(cpf)}) difere do CPF lido na CNH (${formatCpfCnpj(val(cnh, "cpf"))}).`,
        fields: ["cpf"],
      });
    }

    const compCpf = onlyDigits(val(comp, "titular_cpf"));
    if (cpf && compCpf.length === 11 && compCpf !== cpf && (v.enderecoVinculo || "proprio") === "proprio") {
      out.push({
        id: `cpf-comprovante:${compCpf}:${cpf}`,
        severity: "warning",
        message: `O CPF do titular do comprovante (${formatCpfCnpj(compCpf)}) é diferente do CPF do motorista. Indique o vínculo do titular.`,
        fields: ["cpf", "enderecoVinculo"],
      });
    }

    const titularComp = val(comp, "titular_nome") || v.enderecoTitular;
    if (v.nome && titularComp && nameSimilarity(v.nome, titularComp) < 0.6 && (v.enderecoVinculo || "") === "") {
      out.push({
        id: `titular-comprovante:${titularComp}`,
        severity: "warning",
        message: `O comprovante de residência está em nome de "${titularComp}". Confirme se o endereço pertence ao motorista e indique o vínculo do titular.`,
        fields: ["enderecoVinculo", "enderecoTitular"],
      });
    }

    const bankDoc = onlyDigits(v.titularDocumento || val(bank, "titular_documento"));
    if (cpf && bankDoc && v.titularVinculo === "motorista" && bankDoc !== cpf) {
      out.push({
        id: `cpf-banco:${bankDoc}:${cpf}`,
        severity: "error",
        message: `Os dados bancários foram marcados como do motorista, mas o CPF/CNPJ do titular (${formatCpfCnpj(bankDoc)}) é diferente do CPF do motorista.`,
        fields: ["titularDocumento", "titularVinculo"],
      });
    }
    if (bankDoc.length === 14 && v.titularVinculo === "motorista") {
      out.push({
        id: `cnpj-banco-motorista:${bankDoc}`,
        severity: "warning",
        message: "O titular da conta possui CNPJ, mas os dados foram marcados como pertencentes ao motorista.",
        fields: ["titularVinculo"],
      });
    }
    const titularBanco = v.titularNome || val(bank, "titular_nome");
    if ((v.bancoNome || v.conta || v.pixChave || titularBanco) && !v.titularVinculo) {
      out.push({
        id: "banco-vinculo-indefinido",
        severity: "warning",
        message: "Indique a quem pertencem os dados bancários (motorista, empresa ou terceiro).",
        fields: ["titularVinculo"],
      });
    }
    if (v.cnhValidade && v.cnhEmissao && v.cnhValidade < v.cnhEmissao) {
      out.push({ id: "cnh-datas", severity: "error", message: "A validade da CNH é anterior à data de emissão.", fields: ["cnhValidade", "cnhEmissao"] });
    }
    if (v.dataNascimento && v.cnhPrimeiraHabilitacao && v.cnhPrimeiraHabilitacao < v.dataNascimento) {
      out.push({ id: "cnh-1hab", severity: "error", message: "A primeira habilitação é anterior à data de nascimento.", fields: ["cnhPrimeiraHabilitacao"] });
    }
  }

  if (kind === "vehicle") {
    const placa = (v.placa ?? "").toUpperCase();
    const crlv = ex(extractions, "crlv");
    const antt = ex(extractions, "antt");
    const foto = ex(extractions, "foto_veiculo");

    if (crlv && placa && val(crlv, "placa") && val(crlv, "placa") !== placa) {
      out.push({
        id: `placa-crlv:${val(crlv, "placa")}:${placa}`,
        severity: "error",
        message: `A placa informada (${formatPlaca(placa)}) difere da placa lida no CRLV (${formatPlaca(val(crlv, "placa"))}).`,
        fields: ["placa"],
      });
    }
    if (antt && placa && val(antt, "placa") && val(antt, "placa") !== placa) {
      out.push({
        id: `placa-antt:${val(antt, "placa")}:${placa}`,
        severity: "error",
        message: `A placa citada no documento ANTT (${formatPlaca(val(antt, "placa"))}) é diferente da placa do veículo (${formatPlaca(placa)}).`,
        fields: ["placa"],
      });
    }
    if (foto && placa && val(foto, "placa_visivel") && val(foto, "placa_visivel") !== placa) {
      out.push({
        id: `placa-foto:${val(foto, "placa_visivel")}:${placa}`,
        severity: "warning",
        message: `A placa visível na foto (${formatPlaca(val(foto, "placa_visivel"))}) parece diferente da placa do veículo. Confirme se a foto é do veículo correto.`,
        fields: ["placa"],
      });
    }
    const propDoc = onlyDigits(v.proprietarioDocumento);
    const anttDoc = onlyDigits(v.anttTransportadorDocumento || val(antt, "transportador_documento"));
    if (propDoc && anttDoc && propDoc !== anttDoc) {
      out.push({
        id: `proprietario-antt:${anttDoc}:${propDoc}`,
        severity: "warning",
        message: `O CPF/CNPJ do transportador no RNTRC (${formatCpfCnpj(anttDoc)}) é diferente do proprietário no CRLV (${formatCpfCnpj(propDoc)}). Pode ser arrendamento — confirme.`,
        fields: ["proprietarioDocumento", "anttTransportadorDocumento"],
      });
    }
    if (v.anoFabricacao && v.anoModelo && Number(v.anoModelo) < Number(v.anoFabricacao)) {
      out.push({ id: "anos", severity: "error", message: "O ano do modelo é anterior ao ano de fabricação.", fields: ["anoModelo", "anoFabricacao"] });
    }
    const corFoto = val(foto, "cor");
    if (v.cor && corFoto && nameSimilarity(v.cor, corFoto) === 0) {
      out.push({
        id: `cor-foto:${corFoto}:${v.cor}`,
        severity: "warning",
        message: `A cor aparente na foto (${corFoto}) não corresponde à cor informada (${v.cor}).`,
        fields: ["cor"],
      });
    }
    if (v.anttSituacao && /cancel|suspens|vencid|inativ|irregular/i.test(v.anttSituacao)) {
      out.push({ id: `antt-situacao:${v.anttSituacao}`, severity: "warning", message: `Situação cadastral na ANTT: "${v.anttSituacao}".`, fields: ["anttSituacao"] });
    }
  }

  return out;
}

export function unresolvedErrors(list: Inconsistency[], acknowledged: string[]): Inconsistency[] {
  return list.filter((i) => i.severity === "error" && !acknowledged.includes(i.id));
}
