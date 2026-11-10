import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { KIND_LABELS, type RecordKind } from "@/lib/doc-types";
import { formatValue } from "@/lib/display";
import { fieldDef, type FormValues } from "@/lib/fields";
import { formatCpfCnpj, formatNumberBR, formatPhone } from "@/lib/format";
import type { BankPageData } from "../services/settings";

export const FOOTER_HEIGHT = 96; // pt — faixa institucional desenhada pelo assembler

let fontCss: string | null = null;
function fonts(): string {
  if (fontCss) return fontCss;
  const dir = path.join(process.cwd(), "node_modules/@fontsource/open-sans/files");
  const face = (w: number) => {
    try {
      const b64 = readFileSync(path.join(dir, `open-sans-latin-${w}-normal.woff2`)).toString("base64");
      return `@font-face{font-family:"Ficha Sans";font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
    } catch {
      return "";
    }
  };
  fontCss = [400, 600, 700, 800].map(face).join("\n");
  return fontCss;
}

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeColor(c: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}

export interface TemplateTheme {
  primary: string;
  accent: string;
}

function baseCss(theme: TemplateTheme) {
  const primary = safeColor(theme.primary, "#2D5A94");
  const accent = safeColor(theme.accent, "#F4CF14");
  return `${fonts()}
  @page { size: A4; margin: 34pt 0 ${FOOTER_HEIGHT + 22}pt 0; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Ficha Sans", "Open Sans", Arial, sans-serif; color: #101418; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wave { position: absolute; top: 0; right: 0; width: 150pt; height: 190pt; }
  .sheet { position: relative; padding: 0 44pt; }
  .head { padding-top: 54pt; padding-right: 70pt; padding-left: 28pt; text-align: center; }
  h1 { font-weight: 800; font-size: 30pt; line-height: 1.12; letter-spacing: -0.2pt; margin: 0; color: #0b0d10; }
  .accent-bar { width: 64pt; height: 5pt; background: ${accent}; margin: 14pt auto 0; border-radius: 3pt; }
  .lead { margin-top: 30pt; }
  .line { font-size: 16pt; line-height: 1.55; margin: 0; }
  .line b { font-weight: 700; }
  .lead .line:first-child { font-size: 18pt; }
  .muted { color: #8a94a3; font-style: italic; font-size: 0.85em; }
  .group { margin-top: 14pt; page-break-inside: avoid; break-inside: avoid; }
  .group-title { font-weight: 800; font-size: 13pt; letter-spacing: 0.6pt; text-transform: uppercase; color: ${primary}; margin: 0 0 4pt; display: flex; align-items: center; gap: 8pt; }
  .group-title::after { content: ""; flex: 1; height: 1.2pt; background: linear-gradient(90deg, ${accent} 0 36pt, #e3e8ef 36pt); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 22pt; }
  .grid .line { font-size: 12pt; line-height: 1.6; }
  .row2 { display: flex; gap: 28pt; flex-wrap: wrap; }
  .obs { font-size: 11pt; line-height: 1.5; white-space: pre-wrap; border-left: 3pt solid ${accent}; padding: 4pt 0 4pt 10pt; color: #2b3240; }
  .stamp { margin-top: 18pt; font-size: 8.5pt; color: #8a94a3; }
  `;
}

function wave(primary: string) {
  const c = safeColor(primary, "#2D5A94");
  return `<svg class="wave" viewBox="0 0 150 190" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M150 0 L150 190 C140 168 128 150 122 128 C112 92 116 64 92 42 C74 26 52 18 36 0 Z" fill="${c}"/>
  </svg>`;
}

function v(kind: RecordKind, values: FormValues, key: string): string {
  const def = fieldDef(kind, key);
  const raw = values[key] ?? "";
  return def ? formatValue(def, raw) : raw;
}

function show(text: string): string {
  return text ? esc(text) : `<span class="muted">não informado</span>`;
}

function line(label: string, value: string, bold = false) {
  return `<p class="line">${bold ? `<b>${esc(label)}:</b>` : `${esc(label)}:`} ${show(value)}</p>`;
}

function doc(title: string, theme: TemplateTheme, body: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${baseCss(theme)}</style></head>
  <body>${wave(theme.primary)}<div class="sheet">${body}</div></body></html>`;
}

export interface FichaContext {
  theme: TemplateTheme;
  generatedAt: string;
  version: number;
  generatedBy: string;
}

// ---------------------------------------------------------------- Motorista

export function driverFichaHtml(values: FormValues, ctx: FichaContext): string {
  const k: RecordKind = "driver";
  const nat = v(k, values, "naturalidade");
  const endereco = [
    [values.logradouro, values.numero].filter(Boolean).join(", "),
    values.complemento,
    values.bairro,
  ]
    .filter(Boolean)
    .join(" — ");
  const cidadeUf = [values.cidade, values.uf].filter(Boolean).join(", ");
  const contatos: string[] = [];
  if (values.telefonePrincipal || values.contatoComercialNome) {
    contatos.push(`${esc(formatPhone(values.telefonePrincipal) || "—")}${values.contatoComercialNome ? ` / ${esc(values.contatoComercialNome)} (comercial)` : ""}`);
  }
  if (values.telefoneSecundario || values.contatoOperacionalNome) {
    contatos.push(`${esc(formatPhone(values.telefoneSecundario) || "—")}${values.contatoOperacionalNome ? ` / ${esc(values.contatoOperacionalNome)} (operacional)` : ""}`);
  }
  if (values.contatoAdicional) contatos.push(esc(values.contatoAdicional));
  if (values.email) contatos.push(esc(values.email));

  const body = `
  <div class="head"><h1>${esc(KIND_LABELS.driver.fichaTitle)}.</h1><div class="accent-bar"></div></div>
  <div class="lead">
    ${line("Nome", values.nome, true)}
    <div class="row2"><p class="line">CPF: ${show(v(k, values, "cpf"))}</p><p class="line">RG: ${show(values.rg)}</p></div>
    ${line("Data de nascimento", v(k, values, "dataNascimento"))}
    ${line("Natural de", nat)}
  </div>
  <div class="group">
    <p class="line"><b>CNH:</b> ${show(values.cnhNumero)}</p>
    ${line("Registro", values.cnhRegistro)}
    <div class="row2"><p class="line">Emissão: ${show(v(k, values, "cnhEmissao"))}</p><p class="line">Validade: ${show(v(k, values, "cnhValidade"))}</p></div>
    <div class="row2"><p class="line">Categoria: ${show(values.cnhCategoria)}</p><p class="line">1ª habilitação: ${show(v(k, values, "cnhPrimeiraHabilitacao"))}</p><p class="line">UF: ${show(values.cnhUf)}</p></div>
    ${values.cnhObservacoes ? line("Observações da CNH", values.cnhObservacoes) : ""}
  </div>
  <div class="group">
    <p class="line"><b>CONTATO:</b></p>
    ${contatos.length ? contatos.map((c) => `<p class="line">${c}</p>`).join("") : `<p class="line"><span class="muted">não informado</span></p>`}
  </div>
  <div class="group">
    <p class="line"><b>ENDEREÇO:</b></p>
    <p class="line">${show(endereco)}</p>
    <p class="line">${show([cidadeUf, values.cep ? `CEP ${v(k, values, "cep")}` : ""].filter(Boolean).join(" — "))}</p>
  </div>
  ${values.observacoes ? `<div class="group"><p class="group-title">Informações adicionais</p><div class="obs">${esc(values.observacoes)}</div></div>` : ""}
  <p class="stamp">Ficha gerada em ${esc(ctx.generatedAt)} · versão ${ctx.version} · por ${esc(ctx.generatedBy)}. Dados conferidos manualmente a partir dos documentos anexos.</p>`;
  return doc(`Ficha cadastral de motorista — ${values.nome}`, ctx.theme, body);
}

export function hasBankData(values: FormValues): boolean {
  return !!(values.bancoNome || values.conta || values.pixChave || values.agencia);
}

/** Converte os dados bancários do motorista para o formato da página. */
export function driverBankData(values: FormValues): BankPageData {
  const k: RecordKind = "driver";
  return {
    titularNome: values.titularNome,
    titularDocumento: values.titularDocumento,
    vinculo: v(k, values, "titularVinculo"),
    bancoNome: values.bancoNome,
    bancoCodigo: values.bancoCodigo,
    agencia: values.agencia,
    conta: values.conta,
    contaDigito: values.contaDigito,
    contaTipo: values.contaTipo,
    pixTipo: values.pixTipo,
    pixChave: values.pixChave,
  };
}

const ACCOUNT_TYPES: Record<string, string> = { corrente: "Conta corrente", poupanca: "Poupança", pagamento: "Conta de pagamento", salario: "Conta salário" };
const PIX_TYPES: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Chave aleatória" };

export function bankPageHtml(b: BankPageData, ctx: FichaContext, companyName: string): string {
  const conta = [b.conta, b.contaDigito].filter(Boolean).join("-");
  const pixTipo = PIX_TYPES[b.pixTipo] ?? b.pixTipo;
  const pix = b.pixChave
    ? b.pixTipo === "cpf" || b.pixTipo === "cnpj"
      ? formatCpfCnpj(b.pixChave)
      : b.pixTipo === "telefone"
        ? formatPhone(b.pixChave) || b.pixChave
        : b.pixChave
    : "";
  const body = `
  <div class="head"><h1>DADOS BANCÁRIOS</h1><div class="accent-bar"></div>
  ${companyName ? `<p class="line" style="margin-top:10pt;font-size:12pt;color:#4b5565">${esc(companyName)}</p>` : ""}</div>
  <div class="lead" style="text-align:center">
    ${line("Titular", b.titularNome, true)}
    ${line("CPF/CNPJ", formatCpfCnpj(b.titularDocumento))}
    ${b.vinculo ? line("Dados pertencem a", b.vinculo) : ""}
  </div>
  <div class="lead" style="text-align:center;margin-top:22pt">
    ${line("Banco", [b.bancoCodigo, b.bancoNome].filter(Boolean).join(" — "), true)}
    ${line("Agência", b.agencia)}
    ${line("Conta", conta)}
    ${b.contaTipo ? line("Tipo de conta", ACCOUNT_TYPES[b.contaTipo] ?? b.contaTipo) : ""}
  </div>
  ${
    b.pixChave
      ? `<div class="lead" style="text-align:center;margin-top:22pt">
    ${line(`Chave PIX${pixTipo ? ` (${pixTipo})` : ""}`, pix, true)}
  </div>`
      : ""
  }`;
  return doc("Dados bancários", ctx.theme, body);
}

// ------------------------------------------------------------------ Veículo

export function vehicleFichaHtml(values: FormValues, ctx: FichaContext): string {
  const k: RecordKind = "vehicle";
  const modelo = [values.marca, values.modelo].filter(Boolean).join(" ");
  const cap = values.capacidadeCargaKg ? `${formatNumberBR(values.capacidadeCargaKg)} kg` : "";
  const cub = values.cubagemM3 ? `${formatNumberBR(values.cubagemM3, 2)} m³` : "";
  const tag = [values.tagPedagioOperadora ? `(${values.tagPedagioOperadora})` : "", values.tagPedagioNumero].filter(Boolean).join(": ");
  const extra = (label: string, key: string) => `<p class="line">${esc(label)}: ${show(v(k, values, key))}</p>`;
  const anos = [values.anoFabricacao, values.anoModelo].filter(Boolean).join("/");

  const body = `
  <div class="head"><h1>${esc(KIND_LABELS.vehicle.fichaTitle)}.</h1><div class="accent-bar"></div></div>
  <div class="lead">
    ${line("Modelo", modelo, true)}
    ${line("Placa", v(k, values, "placa"))}
    ${line("Capacidade de carga", cap)}
    ${line("Cubagem", cub)}
    ${line("Tipo de veículo", values.tipoVeiculo)}
    ${line("Tipo rodado", values.tipoRodado)}
    ${line("Renavam", values.renavam)}
    <p class="line">Tag de pedágio ${tag ? esc(tag) : `<span class="muted">não informado</span>`}</p>
  </div>
  <div class="group">
    <p class="group-title">Demais informações</p>
    <div class="grid">
      ${extra("Chassi", "chassi")}
      <p class="line">Ano fab./modelo: ${show(anos)}</p>
      ${extra("Cor", "cor")}
      ${extra("Combustível", "combustivel")}
      ${extra("Carroceria", "tipoCarroceria")}
      ${extra("Eixos", "eixos")}
      ${extra("Espécie/tipo", "especieTipo")}
      <p class="line">Registro: ${show([values.municipio, values.ufRegistro].filter(Boolean).join("/"))}</p>
    </div>
  </div>
  <div class="group">
    <p class="group-title">Documentação</p>
    <div class="grid">
      ${extra("RNTRC", "rntrc")}
      ${extra("Categoria ANTT", "anttTipo")}
      ${extra("Situação", "anttSituacao")}
      ${extra("Validade ANTT", "anttValidade")}
      ${extra("Exercício CRLV", "crlvExercicio")}
      ${values.licenciamentoValidade ? extra("Licenciamento até", "licenciamentoValidade") : ""}
    </div>
  </div>
  <div class="group">
    <p class="group-title">Proprietário</p>
    <div class="grid">
      ${extra("Nome/razão social", "proprietarioNome")}
      ${extra("CPF/CNPJ", "proprietarioDocumento")}
    </div>
    ${values.proprietarioInfo ? `<p class="line" style="font-size:11.5pt">${esc(values.proprietarioInfo)}</p>` : ""}
  </div>
  ${values.observacoes ? `<div class="group"><p class="group-title">Observações</p><div class="obs">${esc(values.observacoes)}</div></div>` : ""}
  <p class="stamp">Ficha gerada em ${esc(ctx.generatedAt)} · versão ${ctx.version} · por ${esc(ctx.generatedBy)}. Dados conferidos manualmente a partir dos documentos anexos.</p>`;
  return doc(`Ficha cadastral de veículo — ${values.placa}`, ctx.theme, body);
}
