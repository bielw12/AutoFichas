/**
 * Interpretação heurística de texto obtido por OCR local / camada de texto de
 * PDFs. Usada pelo provedor "local" (sem envio de dados a terceiros).
 *
 * As regras procuram rótulos impressos nos documentos brasileiros e extraem o
 * valor na mesma linha ou na seguinte. A confiança é limitada: todo campo
 * extraído desta forma exige conferência humana.
 */
import type { DocType } from "@/lib/doc-types";
import { CNH_CATEGORIES, isValidCPF, isValidCpfCnpj, isValidUF, parseDateToISO, UFS } from "@/lib/validators";

export interface ParsedField {
  value: string | null;
  confidence: number;
}

export type ParsedFields = Record<string, ParsedField>;

const LABELED = 0.7;
const LOOSE = 0.5;

export function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function toLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

const norm = (s: string) => stripAccents(s).toUpperCase();

const DATE_RE = /\b(\d{2})\s*[/.\-]\s*(\d{2})\s*[/.\-]\s*(\d{4})\b/;
const DATE_RE_G = /\b(\d{2})\s*[/.\-]\s*(\d{2})\s*[/.\-]\s*(\d{4})\b/g;
const CPF_RE_G = /\b\d{3}\.?\d{3}\.?\d{3}\s?-?\s?\d{2}\b/g;
const CNPJ_RE_G = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
/** CNPJ (14) antes de CPF (11) para não truncar documentos sem pontuação. */
const DOC_RE = /\d{2}\.?\d{3}\.?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2}|\d{3}\.?\d{3}\.?\d{3}\s?-?\s?\d{2}/;
const PLACA_RE_G = /\b([A-Z]{3})[\s-]?(\d[A-Z0-9]\d{2})\b/g;

function found(value: string | null | undefined, confidence = LABELED): ParsedField {
  const v = (value ?? "").trim();
  return v ? { value: v, confidence } : { value: null, confidence: 0 };
}

/**
 * Procura uma linha com o rótulo e devolve o texto após o rótulo; se vazio
 * (ou não casar com `accept`), devolve a próxima linha.
 */
export function afterLabel(lines: string[], label: RegExp, accept?: RegExp, lookahead = 2): string | null {
  for (let i = 0; i < lines.length; i++) {
    const n = norm(lines[i]);
    const m = n.match(label);
    if (!m) continue;
    const idx = (m.index ?? 0) + m[0].length;
    const rest = lines[i].slice(idx).replace(/^[\s:.\-–]+/, "").trim();
    if (rest && (!accept || accept.test(norm(rest)))) return accept ? (norm(rest).match(accept)?.[0] ?? rest) : rest;
    for (let j = 1; j <= lookahead && i + j < lines.length; j++) {
      const cand = lines[i + j].trim();
      if (!cand) continue;
      if (!accept) return cand;
      const mm = norm(cand).match(accept);
      if (mm) return mm[0];
    }
  }
  return null;
}

function dateAfter(lines: string[], label: RegExp): string | null {
  const v = afterLabel(lines, label, DATE_RE);
  return v ? parseDateToISO(v.replace(/\s/g, "")) && v.replace(/\s/g, "") : null;
}

function firstValid(text: string, re: RegExp, validate: (s: string) => boolean): string | null {
  for (const m of text.matchAll(re)) {
    const d = m[0].replace(/\D/g, "");
    if (validate(d)) return d;
  }
  return null;
}

function cleanName(s: string | null): string | null {
  if (!s) return null;
  const v = s.replace(/[^A-Za-zÀ-ÿ' ]/g, " ").replace(/\s+/g, " ").trim();
  return v.length >= 5 && v.split(" ").length >= 2 ? v : null;
}

// ------------------------------------------------------------ Classificação

const SIGNATURES: { type: DocType; patterns: RegExp[] }[] = [
  { type: "cnh", patterns: [/CARTEIRA NACIONAL DE HABILITACAO/, /HABILITACAO/, /PERMISSAO PARA DIRIGIR/, /CAT\.? ?HAB/, /1[AªA]? ?HABILITACAO/, /DETRAN/] },
  { type: "crlv", patterns: [/CERTIFICADO DE REGISTRO E LICENCIAMENTO/, /\bCRLV\b/, /RENAVAM/, /CHASSI/, /MARCA ?\/ ?MODELO/] },
  { type: "antt", patterns: [/\bRNTRC\b/, /\bANTT\b/, /TRANSPORTADOR AUTONOMO/, /AGENCIA NACIONAL DE TRANSPORTES TERRESTRES/, /REGISTRO NACIONAL DE TRANSPORTADORES/] },
  { type: "dados_bancarios", patterns: [/\bAGENCIA\b/, /\bCONTA\b/, /CHAVE PIX/, /\bPIX\b/, /DADOS BANCARIOS/, /CONTA CORRENTE/, /FAVORECIDO/] },
  { type: "comprovante_residencia", patterns: [/\bCEP\b/, /CONTA DE (ENERGIA|LUZ|AGUA|GAS)/, /FATURA/, /CONSUMO/, /KWH/, /COMPROVANTE DE (RESIDENCIA|ENDERECO)/, /VENCIMENTO/] },
];

export function classifyText(text: string): { type: DocType | null; score: number } {
  const n = norm(text);
  let best: { type: DocType | null; score: number } = { type: null, score: 0 };
  for (const sig of SIGNATURES) {
    const score = sig.patterns.filter((p) => p.test(n)).length;
    if (score > best.score) best = { type: sig.type, score };
  }
  return best.score >= 2 ? best : { type: null, score: best.score };
}

// -------------------------------------------------------------------- CNH

export function parseCnh(text: string): ParsedFields {
  const lines = toLines(text);
  const n = norm(text);
  const out: ParsedFields = {};

  out.nome = found(cleanName(afterLabel(lines, /^(2 E 1 )?NOME( E SOBRENOME)?\b(?! SOCIAL)/)));
  const cpfLabeled = afterLabel(lines, /\bCPF\b/, /\d{3}\.?\d{3}\.?\d{3}\s?-?\s?\d{2}/);
  const cpfDigits = cpfLabeled?.replace(/\D/g, "");
  out.cpf = cpfDigits && isValidCPF(cpfDigits) ? found(cpfDigits) : found(firstValid(text, CPF_RE_G, isValidCPF), LOOSE);
  out.rg = found(afterLabel(lines, /DOC\.? ?IDENTIDADE( ?\/ ?ORG\.? ?EMISSOR ?\/ ?UF)?|IDENTIDADE/, /[0-9X.\-]{5,}( ?[A-Z]{2,6})?( ?\/? ?[A-Z]{2})?/));

  const nascLine = afterLabel(lines, /(DATA,? LOCAL E UF DE )?NASCIMENTO/, undefined);
  const nascDate = nascLine?.match(DATE_RE)?.[0] ?? null;
  out.data_nascimento = found(nascDate ? nascDate.replace(/\s/g, "") : dateAfter(lines, /NASCIMENTO/));
  if (nascLine && nascDate) {
    const rest = nascLine.slice(nascLine.indexOf(nascDate) + nascDate.length).replace(/^[\s,\-]+/, "").trim();
    if (/[A-Za-z]{3,}/.test(rest)) out.naturalidade = found(rest);
  }
  if (!out.naturalidade?.value) out.naturalidade = found(afterLabel(lines, /LOCAL DE NASCIMENTO|NATURALIDADE/));

  out.registro = found(afterLabel(lines, /N[ºO°]?\.? ?(DE )?REGISTRO/, /\d{11}/) ?? n.match(/\b\d{11}\b/)?.[0] ?? null);
  out.numero_cnh = found(afterLabel(lines, /N[ºO°]? ?(DO )?(ESPELHO|FORMULARIO)|NUMERO DA CNH/, /\d{8,11}/));
  out.data_validade = found(dateAfter(lines, /VALIDADE/));
  out.primeira_habilitacao = found(dateAfter(lines, /1[ªAº]? ?HABILITACAO|PRIMEIRA HABILITACAO/));
  out.data_emissao = found(dateAfter(lines, /DATA (DE )?EMISSAO|EMISSAO/));
  const catRe = new RegExp(`\\b(${[...CNH_CATEGORIES].sort((a, b) => b.length - a.length).join("|")})\\b`);
  out.categoria = found(afterLabel(lines, /CAT\.? ?HAB\.?|CATEGORIA/, catRe));
  const local = afterLabel(lines, /^LOCAL\b(?! DE NASCIMENTO)/);
  const ufLocal = local?.toUpperCase().match(/\b([A-Z]{2})\s*$/)?.[1];
  out.uf_emissao = found(ufLocal && isValidUF(ufLocal) ? ufLocal : null);
  out.observacoes = found(afterLabel(lines, /OBSERVACOES/));
  return out;
}

// ------------------------------------------------------------ Comprovante

const LOGRADOURO_RE = /^(RUA|R\.|AV\.?|AVENIDA|ALAMEDA|AL\.|TRAVESSA|TV\.|ESTRADA|ESTR\.|RODOVIA|ROD\.|PRACA|PCA\.|VIELA|LARGO|VILA|CONDOMINIO)\b/;

export function parseComprovante(text: string): ParsedFields {
  const lines = toLines(text);
  const out: ParsedFields = {};

  out.titular_nome = found(cleanName(afterLabel(lines, /^(NOME DO )?(TITULAR|CLIENTE|CONSUMIDOR|NOME)\b/)));
  out.titular_cpf = found(firstValid(text, CPF_RE_G, isValidCPF), LOOSE);

  const cepLabeled = afterLabel(lines, /\bCEP\b/, /\d{5}-?\d{3}/);
  const cep = cepLabeled ?? text.match(/\b\d{5}-\d{3}\b/)?.[0] ?? null;
  out.cep = found(cep?.replace(/\D/g, ""), cepLabeled ? LABELED : LOOSE);

  const addrIdx = lines.findIndex((l) => LOGRADOURO_RE.test(norm(l)));
  const labeledAddr = afterLabel(lines, /^ENDERECO( DE (ENTREGA|INSTALACAO))?\b/);
  const addrLine = addrIdx >= 0 ? lines[addrIdx] : labeledAddr;
  if (addrLine) {
    const m = addrLine.match(/^(.+?)[,\s]+(?:N[ºo°]?\.?\s*)?(\d+[A-Za-z]?|S\/?N)\b\s*[,\-–]?\s*(.*)$/i);
    if (m) {
      out.logradouro = found(m[1].replace(/[,\s]+$/, ""));
      out.numero = found(m[2].toUpperCase());
      const rest = m[3].replace(/\b(CEP)?\s*\d{5}-?\d{3}.*/i, "").trim();
      if (rest && !/\b[A-Z]{2}$/.test(rest)) out.complemento = found(rest);
    } else {
      out.logradouro = found(addrLine);
    }
  }
  out.bairro = found(afterLabel(lines, /\bBAIRRO\b/));
  // Cidade - UF ou Cidade/UF
  for (const l of lines) {
    const m = stripAccents(l).toUpperCase().match(/([A-Z][A-Z ]{2,40}?)\s*[-/,]\s*([A-Z]{2})\b(?!\w)/);
    if (m && isValidUF(m[2]) && !/CEP|CPF|CNPJ/.test(m[1])) {
      const cityRaw = l.slice(0, l.toUpperCase().lastIndexOf(m[2])).replace(/[-/,\s]+$/, "");
      const city = cityRaw.replace(/^.*\b(CEP\s*)?\d{5}-?\d{3}\s*/i, "").replace(/^(CIDADE|MUNICIPIO)\s*:?\s*/i, "").trim();
      if (city.length >= 3) {
        out.cidade = found(city, LOOSE);
        out.uf = found(m[2], LOOSE);
        break;
      }
    }
  }
  if (!out.cidade?.value) out.cidade = found(afterLabel(lines, /\b(CIDADE|MUNICIPIO)\b/));
  out.data_emissao = found(dateAfter(lines, /DATA (DE )?EMISSAO|EMISSAO|EMITIDO EM/));
  return out;
}

// --------------------------------------------------------------- Bancários

const BANKS: [RegExp, string][] = [
  [/BANCO DO BRASIL/, "Banco do Brasil"],
  [/CAIXA ECONOMICA|\bCAIXA\b/, "Caixa Econômica Federal"],
  [/BRADESCO/, "Bradesco"],
  [/ITAU/, "Itaú Unibanco"],
  [/SANTANDER/, "Santander"],
  [/NUBANK|NU PAGAMENTOS/, "Nubank"],
  [/BANCO INTER|\bINTER\b/, "Banco Inter"],
  [/\bC6\b/, "C6 Bank"],
  [/SICOOB/, "Sicoob"],
  [/SICREDI/, "Sicredi"],
  [/BANRISUL/, "Banrisul"],
  [/\bBTG\b/, "BTG Pactual"],
  [/PAGBANK|PAGSEGURO/, "PagBank"],
  [/MERCADO PAGO/, "Mercado Pago"],
  [/BANCO ORIGINAL/, "Banco Original"],
  [/SAFRA/, "Banco Safra"],
];

export function parseBanco(text: string): ParsedFields {
  const lines = toLines(text);
  const n = norm(text);
  const out: ParsedFields = {};
  const bank = BANKS.find(([re]) => re.test(n));
  out.banco_nome = found(afterLabel(lines, /^(NOME DO )?BANCO\b(?! ?:? ?\d)/) ?? bank?.[1] ?? null, bank ? LOOSE : LABELED);
  out.banco_codigo = found(afterLabel(lines, /COD(IGO)?\.? ?(DO )?BANCO|BANCO ?:? ?(?=\d{3}\b)/, /\b\d{3}\b/));

  const ag = afterLabel(lines, /\bAG(ENCIA)?\b\.?/, /\d{3,5}(-?[0-9X])?/);
  out.agencia = found(ag);

  const contaRaw = afterLabel(lines, /\b(CONTA( CORRENTE| POUPANCA| DE PAGAMENTO)?|C\/C|CC)\b(?! ?TIPO)/, /\d[\d.]{2,14}(\s?-\s?[0-9X])?/);
  if (contaRaw) {
    const [c, d] = contaRaw.replace(/\./g, "").split(/\s?-\s?/);
    out.conta = found(c);
    out.conta_digito = found(d ?? null);
  }
  out.tipo_conta = found(/POUPANCA/.test(n) ? "poupanca" : /CONTA CORRENTE|\bC\/C\b/.test(n) ? "corrente" : /CONTA DE PAGAMENTO/.test(n) ? "pagamento" : /CONTA SALARIO/.test(n) ? "salario" : null, LOOSE);
  out.titular_nome = found(cleanName(afterLabel(lines, /\b(TITULAR|FAVORECIDO|BENEFICIARIO|NOME)\b/)));
  const doc = afterLabel(lines, /\b(CPF ?\/ ?CNPJ|CPF|CNPJ)\b/, DOC_RE);
  const docDigits = doc?.replace(/\D/g, "");
  out.titular_documento = docDigits && isValidCpfCnpj(docDigits) ? found(docDigits) : found(firstValid(text, CNPJ_RE_G, isValidCpfCnpj) ?? firstValid(text, CPF_RE_G, isValidCPF), LOOSE);

  const pixLine = afterLabel(lines, /CHAVE PIX|\bPIX\b/);
  if (pixLine) {
    const key = pixLine.replace(/^(CHAVE|TIPO)\s*:?\s*/i, "").replace(/^(CPF|CNPJ|E-?MAIL|TELEFONE|CELULAR|ALEATORIA)\s*:?\s*/i, "").trim();
    const k = key.replace(/\s/g, "");
    out.pix_chave = found(/^\+?\d[\d()\- ]{9,}$/.test(key) ? key : k);
    const digits = k.replace(/\D/g, "");
    const tipo = k.includes("@")
      ? "email"
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)
        ? "aleatoria"
        : digits.length === 14 && isValidCpfCnpj(digits)
          ? "cnpj"
          : digits.length === 11 && isValidCPF(digits)
            ? "cpf"
            : /^\+?\d[\d()\- ]{9,}$/.test(key)
              ? "telefone"
              : null;
    out.pix_tipo = found(tipo, LOOSE);
  }
  return out;
}

// -------------------------------------------------------------------- CRLV

export function parseCrlv(text: string): ParsedFields {
  const lines = toLines(text);
  const n = norm(text);
  const out: ParsedFields = {};
  const placaL = afterLabel(lines, /\bPLACA\b/, /[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}/);
  out.placa = placaL ? found(placaL.replace(/[\s-]/g, "")) : found([...n.matchAll(PLACA_RE_G)][0]?.slice(1).join("") ?? null, LOOSE);
  out.renavam = found(afterLabel(lines, /RENAVAM/, /\d{9,11}/));
  out.numero_crv = found(afterLabel(lines, /N[ºO°]? ?(DO )?CRV|NUMERO DO CRV|N[ºO°]? ?SEGURANCA ?CRV/, /\d{8,12}/));
  out.chassi = found(afterLabel(lines, /\bCHASSI\b/, /[A-Z0-9]{17}/));
  const mm = afterLabel(lines, /MARCA ?\/ ?MODELO( ?\/ ?VERSAO)?/);
  if (mm) {
    const [marca, ...rest] = mm.split("/");
    out.marca = found(marca.trim());
    out.modelo = found(rest.join("/").trim() || null);
  }
  out.ano_fabricacao = found(afterLabel(lines, /ANO (DE )?FABRICACAO|ANO FAB/, /\b(19|20)\d{2}\b/));
  out.ano_modelo = found(afterLabel(lines, /ANO (DO )?MODELO|ANO MOD/, /\b(19|20)\d{2}\b/));
  out.cor = found(afterLabel(lines, /COR( PREDOMINANTE)?\b/, /[A-Z]{3,}/));
  out.combustivel = found(afterLabel(lines, /COMBUSTIVEL/, /[A-Z][A-Z /]{2,}/));
  out.categoria = found(afterLabel(lines, /\bCATEGORIA\b/, /[A-Z]{4,}/));
  out.especie_tipo = found(afterLabel(lines, /ESPECIE ?\/? ?TIPO/));
  out.carroceria = found(afterLabel(lines, /\bCARROCERIA\b/));
  out.capacidade = found(afterLabel(lines, /CAPACIDADE|CAP ?\/ ?POT ?\/ ?CIL/, /\d+([.,]\d+)?\s?(T|KG|TON)?/));
  out.pbt = found(afterLabel(lines, /PESO BRUTO( TOTAL)?|\bPBT\b/, /\d+([.,]\d+)?\s?(T|KG)?/));
  out.eixos = found(afterLabel(lines, /\bEIXOS\b/, /\b\d{1,2}\b/));
  out.proprietario_nome = found(cleanName(afterLabel(lines, /^NOME( DO PROPRIETARIO)?\b|PROPRIETARIO/)));
  const doc = afterLabel(lines, /CPF ?\/ ?CNPJ|\bCPF\b|\bCNPJ\b/, DOC_RE);
  out.proprietario_documento = found(doc?.replace(/\D/g, "") ?? null);
  const local = afterLabel(lines, /^LOCAL\b|MUNICIPIO/);
  const lm = local?.toUpperCase().match(/^(.+?)[\s,/-]+([A-Z]{2})$/);
  if (lm && isValidUF(lm[2])) {
    out.municipio = found(local!.slice(0, lm[1].length).trim());
    out.uf = found(lm[2]);
  } else if (local) out.municipio = found(local);
  out.exercicio = found(afterLabel(lines, /EXERCICIO/, /\b(19|20)\d{2}\b/));
  out.data_emissao = found(dateAfter(lines, /DATA( DE EMISSAO)?\b/));
  return out;
}

// -------------------------------------------------------------------- ANTT

export function parseAntt(text: string): ParsedFields {
  const lines = toLines(text);
  const n = norm(text);
  const out: ParsedFields = {};
  out.rntrc = found(afterLabel(lines, /RNTRC/, /\d{6,12}/));
  out.transportador_nome = found(cleanName(afterLabel(lines, /RAZAO SOCIAL|NOME DO TRANSPORTADOR|TRANSPORTADOR\b|^NOME\b/)));
  const doc = afterLabel(lines, /CPF ?\/ ?CNPJ|\bCNPJ\b|\bCPF\b/, DOC_RE);
  out.transportador_documento = found(doc?.replace(/\D/g, "") ?? null);
  const sig = n.match(/\b(TAC|ETC|CTC)\b/)?.[1];
  const tipo = sig ?? (/AUTONOMO/.test(n) ? "TAC" : /COOPERATIVA/.test(n) ? "CTC" : /EMPRESA DE TRANSPORTE/.test(n) ? "ETC" : null);
  out.tipo_transportador = found(tipo, sig ? LABELED : LOOSE);
  out.categoria = found(afterLabel(lines, /\bCATEGORIA\b/));
  out.situacao = found(afterLabel(lines, /SITUACAO( CADASTRAL| DO REGISTRO)?/, /[A-Z]{4,}( [A-Z]+)?/));
  out.data_emissao = found(dateAfter(lines, /EMISSAO|EMITIDO EM|DATA DA CONSULTA|CONSULTA REALIZADA/));
  out.data_validade = found(dateAfter(lines, /VALIDADE|VALIDO ATE|VENCIMENTO/));
  const placas = Array.from(new Set([...n.matchAll(PLACA_RE_G)].map((m) => m[1] + m[2])));
  out.placa = found(placas.length === 1 ? placas[0] : null, LOOSE);
  return out;
}

export const LOCAL_PARSERS: Partial<Record<DocType, (text: string) => ParsedFields>> = {
  cnh: parseCnh,
  comprovante_residencia: parseComprovante,
  dados_bancarios: parseBanco,
  crlv: parseCrlv,
  antt: parseAntt,
};

export { DATE_RE_G, UFS };
