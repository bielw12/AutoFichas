/**
 * Gera documentos FICTÍCIOS para testes automatizados.
 * Nenhum dado real é usado: nomes inventados e números calculados apenas para
 * passar nas validações de formato (dígitos verificadores).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium, type Browser } from "playwright-core";

export function cpfWithDv(base9: string): string {
  const d = base9.split("").map(Number);
  const calc = (arr: number[]) => {
    const len = arr.length;
    const sum = arr.reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(d);
  const d2 = calc([...d, d1]);
  return base9 + d1 + d2;
}

export function cnpjWithDv(base12: string): string {
  const calc = (s: string) => {
    const w = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = s.split("").reduce((a, n, i) => a + Number(n) * w[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12);
  return base12 + d1 + calc(base12 + d1);
}

export function renavamWithDv(base10: string): string {
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const sum = base10.split("").reverse().reduce((a, n, i) => a + Number(n) * w[i], 0);
  let dv = (sum * 10) % 11;
  if (dv === 10) dv = 0;
  return base10 + dv;
}

export function cnhRegistroWithDv(base9: string): string {
  const d = base9.split("").map(Number);
  let sum = 0;
  for (let i = 0, j = 9; i < 9; i++, j--) sum += d[i] * j;
  let dv1 = sum % 11;
  let dsc = 0;
  if (dv1 >= 10) {
    dv1 = 0;
    dsc = 2;
  }
  sum = 0;
  for (let i = 0, j = 1; i < 9; i++, j++) sum += d[i] * j;
  const x = sum % 11;
  let dv2 = x >= 10 ? 0 : x - dsc;
  if (dv2 < 0) dv2 += 11;
  if (dv2 >= 10) dv2 = 0;
  return `${base9}${dv1}${dv2}`;
}

const fmtCpf = (c: string) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;

export const FICTICIO = {
  motorista: {
    nome: "JOAO TESTE FICTICIO DA SILVA",
    cpf: cpfWithDv("123456789"),
    rg: "12345678 SSP SP",
    nascimento: "15/03/1985",
    naturalidade: "CAMPINAS, SP",
    registro: cnhRegistroWithDv("123456789"),
    espelho: "1234567890",
    validade: "20/08/2031",
    emissao: "21/08/2021",
    primeira: "10/01/2005",
    categoria: "AE",
    cep: "13010-100",
    logradouro: "RUA DAS FLORES FICTICIAS",
    numero: "123",
    bairro: "CENTRO",
    cidade: "CAMPINAS",
    uf: "SP",
    banco: "Banco do Brasil",
    agencia: "1234-5",
    conta: "98765-4",
  },
  veiculo: {
    placa: "TST1A23",
    renavam: renavamWithDv("0123456789"),
    chassi: "9BWZZZ377VT004251",
    marca: "VW",
    modelo: "24.280 CRM 6X2 TESTE",
    anoFab: "2019",
    anoMod: "2020",
    cor: "BRANCA",
    combustivel: "DIESEL",
    proprietario: "TRANSPORTES FICTICIOS LTDA",
    cnpj: cnpjWithDv("123456780001"),
    rntrc: "012345678",
  },
};

const STYLE = `<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111;font-size:15px}
  h1{font-size:20px;margin:0 0 4px} .tag{color:#b00;font-weight:bold;font-size:12px;margin-bottom:18px}
  .l{font-size:11px;color:#444;margin-top:12px;text-transform:uppercase} .v{font-size:16px;font-weight:bold}
</style>`;

function field(label: string, value: string) {
  return `<div class="l">${label}</div><div class="v">${value}</div>`;
}

export function cnhHtml() {
  const m = FICTICIO.motorista;
  return `<html><head><meta charset="utf-8">${STYLE}</head><body>
  <h1>CARTEIRA NACIONAL DE HABILITAÇÃO</h1><div class="tag">DOCUMENTO FICTÍCIO PARA TESTES — SEM VALIDADE</div>
  ${field("Nome", m.nome)}
  ${field("Doc. Identidade / Órg. Emissor / UF", m.rg)}
  ${field("CPF", fmtCpf(m.cpf))}
  ${field("Data, Local e UF de Nascimento", `${m.nascimento}, ${m.naturalidade}`)}
  ${field("Nº Registro", m.registro)}
  ${field("Validade", m.validade)}
  ${field("1ª Habilitação", m.primeira)}
  ${field("Cat. Hab.", m.categoria)}
  ${field("Observações", "EAR")}
  ${field("Local", "SAO PAULO, SP")}
  ${field("Data Emissão", m.emissao)}
  ${field("Nº do Espelho", m.espelho)}
  </body></html>`;
}

export function comprovanteHtml() {
  const m = FICTICIO.motorista;
  return `<html><head><meta charset="utf-8">${STYLE}</head><body style="font-size:22px">
  <h1 style="font-size:30px">CONTA DE ENERGIA ELÉTRICA — FATURA</h1><div class="tag">DOCUMENTO FICTÍCIO PARA TESTES</div>
  <p>Cliente: ${m.nome}</p>
  <p>${m.logradouro}, ${m.numero}</p>
  <p>Bairro: ${m.bairro}</p>
  <p>CEP ${m.cep}</p>
  <p>${m.cidade} - ${m.uf}</p>
  <p>Data de emissão: 05/10/2026</p>
  <p>Consumo: 230 kWh</p>
  </body></html>`;
}

export function bancoHtml() {
  const m = FICTICIO.motorista;
  return `<html><head><meta charset="utf-8">${STYLE}</head><body style="font-size:22px">
  <h1 style="font-size:30px">DADOS BANCÁRIOS</h1><div class="tag">DOCUMENTO FICTÍCIO PARA TESTES</div>
  <p>Banco: ${m.banco}</p>
  <p>Agência: ${m.agencia}</p>
  <p>Conta Corrente: ${m.conta}</p>
  <p>Titular: ${m.nome}</p>
  <p>CPF: ${fmtCpf(m.cpf)}</p>
  <p>Chave PIX: teste.ficticio@example.com</p>
  </body></html>`;
}

export function crlvHtml() {
  const v = FICTICIO.veiculo;
  return `<html><head><meta charset="utf-8">${STYLE}</head><body>
  <h1>CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO</h1><div class="tag">DOCUMENTO FICTÍCIO PARA TESTES — SEM VALIDADE</div>
  ${field("Código Renavam", v.renavam)}
  ${field("Placa", v.placa)}
  ${field("Exercício", "2026")}
  ${field("Ano Fabricação", v.anoFab)}
  ${field("Ano Modelo", v.anoMod)}
  ${field("Marca / Modelo / Versão", `${v.marca}/${v.modelo}`)}
  ${field("Espécie / Tipo", "CARGA/CAMINHAO")}
  ${field("Chassi", v.chassi)}
  ${field("Cor Predominante", v.cor)}
  ${field("Combustível", v.combustivel)}
  ${field("Categoria", "PARTICULAR")}
  ${field("Capacidade", "14.5T")}
  ${field("Eixos", "3")}
  ${field("Nome", v.proprietario)}
  ${field("CPF / CNPJ", v.cnpj)}
  ${field("Local", "CAMPINAS SP")}
  ${field("Data", "10/02/2026")}
  </body></html>`;
}

export function anttHtml() {
  const v = FICTICIO.veiculo;
  return `<html><head><meta charset="utf-8">${STYLE}</head><body>
  <h1>AGÊNCIA NACIONAL DE TRANSPORTES TERRESTRES — ANTT</h1><div class="tag">DOCUMENTO FICTÍCIO PARA TESTES — SEM VALIDADE</div>
  <h2>Registro Nacional de Transportadores Rodoviários de Cargas</h2>
  ${field("RNTRC", v.rntrc)}
  ${field("Razão Social", v.proprietario)}
  ${field("CNPJ", v.cnpj)}
  ${field("Categoria", "ETC - EMPRESA DE TRANSPORTE DE CARGAS")}
  ${field("Situação", "ATIVO")}
  ${field("Data da Consulta", "01/10/2026")}
  ${field("Validade", "01/10/2031")}
  ${field("Veículo", v.placa)}
  </body></html>`;
}

let browser: Browser | null = null;
async function getBrowser() {
  browser ??= await chromium.launch();
  return browser;
}

export async function closeFixtureBrowser() {
  await browser?.close();
  browser = null;
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: "A4" });
  await page.close();
  return Buffer.from(pdf);
}

export async function htmlToImage(html: string, type: "png" | "jpeg" = "png"): Promise<Buffer> {
  const page = await (await getBrowser()).newPage({ viewport: { width: 1000, height: 1200 } });
  await page.setContent(html);
  const img = await page.screenshot({ type, fullPage: true, quality: type === "jpeg" ? 92 : undefined });
  await page.close();
  return Buffer.from(img);
}

/** "Foto" de veículo sintética (desenho vetorial rasterizado). */
export async function vehiclePhoto(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
    <rect width="1600" height="1000" fill="#9fb7cf"/><rect y="760" width="1600" height="240" fill="#555"/>
    <rect x="180" y="300" width="900" height="420" fill="#f2f2f2" stroke="#333" stroke-width="6"/>
    <rect x="1080" y="420" width="320" height="300" fill="#ffffff" stroke="#333" stroke-width="6"/>
    <rect x="1220" y="450" width="150" height="110" fill="#6fa1d6"/>
    <circle cx="330" cy="760" r="80" fill="#222"/><circle cx="520" cy="760" r="80" fill="#222"/><circle cx="1250" cy="760" r="80" fill="#222"/>
    <text x="600" y="530" font-size="60" font-family="Arial" fill="#999">FOTO FICTÍCIA</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

/** Imagem praticamente sem conteúdo legível (para testar documento ilegível). */
export async function illegibleImage(): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 1200, channels: 3, background: "#d8d8d8" } })
    .blur(20)
    .jpeg()
    .toBuffer();
}

/** Logotipo fictício (PNG com fundo transparente). */
export async function fictitiousLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300">
    <text x="20" y="190" font-family="Arial" font-weight="900" font-size="170" fill="#F4CF14">TFX</text>
    <rect x="470" y="95" width="260" height="110" rx="10" fill="none" stroke="#fff" stroke-width="12"/>
    <rect x="730" y="130" width="110" height="75" rx="10" fill="none" stroke="#fff" stroke-width="12"/>
    <circle cx="540" cy="225" r="28" fill="#fff"/><circle cx="780" cy="225" r="28" fill="#fff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface FixtureSet {
  cnhPdf: string;
  comprovantePng: string;
  bancoJpg: string;
  crlvPdf: string;
  anttPdf: string;
  fotoJpg: string;
  ilegivelJpg: string;
  cnhNovaPdf: string;
  logoPng: string;
}

/** Gera todos os arquivos fictícios em disco (usado pelos testes E2E). */
export async function writeFixtures(dir: string): Promise<FixtureSet> {
  await mkdir(dir, { recursive: true });
  const out = (n: string) => path.join(dir, n);
  const files: FixtureSet = {
    cnhPdf: out("cnh-ficticia.pdf"),
    comprovantePng: out("comprovante-ficticio.png"),
    bancoJpg: out("dados-bancarios-ficticios.jpg"),
    crlvPdf: out("crlv-ficticio.pdf"),
    anttPdf: out("antt-ficticio.pdf"),
    fotoJpg: out("foto-veiculo-ficticia.jpg"),
    ilegivelJpg: out("documento-ilegivel.jpg"),
    cnhNovaPdf: out("cnh-ficticia-renovada.pdf"),
    logoPng: out("logo-ficticio.png"),
  };
  await writeFile(files.cnhPdf, await htmlToPdfBuffer(cnhHtml()));
  await writeFile(files.comprovantePng, await htmlToImage(comprovanteHtml(), "png"));
  await writeFile(files.bancoJpg, await htmlToImage(bancoHtml(), "jpeg"));
  await writeFile(files.crlvPdf, await htmlToPdfBuffer(crlvHtml()));
  await writeFile(files.anttPdf, await htmlToPdfBuffer(anttHtml()));
  await writeFile(files.fotoJpg, await vehiclePhoto());
  await writeFile(files.ilegivelJpg, await illegibleImage());
  await writeFile(files.cnhNovaPdf, await htmlToPdfBuffer(cnhHtml().replace(FICTICIO.motorista.validade, "20/08/2036")));
  await writeFile(files.logoPng, await fictitiousLogo());
  await closeFixtureBrowser();
  return files;
}
