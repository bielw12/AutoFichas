import type { DocType } from "./doc-types";

/**
 * Schemas de extração por tipo de documento. São a fonte única para:
 *  - o JSON Schema enviado aos provedores de IA;
 *  - a validação/normalização do resultado;
 *  - o mapeamento para os campos das fichas.
 */

export type ValueFormat =
  | "text"
  | "name"
  | "cpf"
  | "cpf_cnpj"
  | "date"
  | "uf"
  | "cep"
  | "digits"
  | "placa"
  | "renavam"
  | "chassi"
  | "year"
  | "cnh_categoria"
  | "cnh_registro"
  | "phone"
  | "enum";

export interface ExtractionFieldDef {
  key: string;
  label: string;
  format: ValueFormat;
  /** Instrução para o modelo. */
  description: string;
  options?: string[];
}

export interface DocSchema {
  docType: DocType;
  title: string;
  /** Contexto específico do documento para o modelo. */
  guidance: string;
  fields: ExtractionFieldDef[];
}

export const EXTRACTION_SCHEMAS: Partial<Record<DocType, DocSchema>> = {
  cnh: {
    docType: "cnh",
    title: "Carteira Nacional de Habilitação (CNH) brasileira — física ou digital",
    guidance:
      "A CNH pode estar em PDF (CNH-e), foto da frente, verso ou ambos. O 'número da CNH' é o número do espelho/formulário (geralmente impresso no verso ou na lateral, 9 a 11 dígitos), diferente do 'Nº REGISTRO' (11 dígitos). O campo 'DOC. IDENTIDADE / ÓRG. EMISSOR / UF' contém o RG. Naturalidade aparece como 'LOCAL DE NASCIMENTO' ou 'DATA, LOCAL E UF DE NASCIMENTO'.",
    fields: [
      { key: "nome", label: "Nome completo", format: "name", description: "Nome completo do condutor exatamente como impresso." },
      { key: "cpf", label: "CPF", format: "cpf", description: "CPF do condutor (11 dígitos)." },
      { key: "rg", label: "RG", format: "text", description: "Número do documento de identidade com órgão emissor e UF, se houver (ex.: '12345678 SSP SP')." },
      { key: "data_nascimento", label: "Data de nascimento", format: "date", description: "Data de nascimento (dd/mm/aaaa)." },
      { key: "naturalidade", label: "Naturalidade", format: "text", description: "Cidade e UF de nascimento (ex.: 'CAMPINAS, SP')." },
      { key: "numero_cnh", label: "Número da CNH (espelho)", format: "digits", description: "Número do espelho/formulário da CNH. Não confundir com o Nº de registro." },
      { key: "registro", label: "Nº de registro", format: "cnh_registro", description: "Número de registro da CNH (11 dígitos), campo 'Nº REGISTRO'." },
      { key: "data_emissao", label: "Data de emissão", format: "date", description: "Data de emissão do documento." },
      { key: "data_validade", label: "Validade", format: "date", description: "Data de validade da CNH." },
      { key: "categoria", label: "Categoria", format: "cnh_categoria", description: "Categoria de habilitação (A, B, C, D, E, AB, AC, AD, AE)." },
      { key: "primeira_habilitacao", label: "1ª habilitação", format: "date", description: "Data da primeira habilitação." },
      { key: "uf_emissao", label: "UF de emissão", format: "uf", description: "Sigla da UF emissora (ex.: SP)." },
      { key: "observacoes", label: "Observações da CNH", format: "text", description: "Conteúdo do campo OBSERVAÇÕES (ex.: 'EAR', restrições médicas). Vazio se não houver." },
    ],
  },
  comprovante_residencia: {
    docType: "comprovante_residencia",
    title: "Comprovante de residência (conta de consumo, fatura, declaração ou contrato)",
    guidance:
      "Extraia o endereço de entrega/instalação do TITULAR do documento. O titular pode não ser o motorista. Não use endereços da empresa emissora (concessionária, banco, operadora). A data de emissão pode aparecer como 'emissão', 'data de leitura', 'referência' ou 'vencimento' — prefira a data de emissão; se só houver mês de referência, informe o primeiro dia do mês e reduza a confiança.",
    fields: [
      { key: "titular_nome", label: "Titular", format: "name", description: "Nome do titular do comprovante." },
      { key: "titular_cpf", label: "CPF do titular", format: "cpf_cnpj", description: "CPF/CNPJ do titular, somente se impresso." },
      { key: "logradouro", label: "Logradouro", format: "text", description: "Tipo e nome do logradouro (ex.: 'RUA DAS FLORES')." },
      { key: "numero", label: "Número", format: "text", description: "Número do imóvel (ou 'S/N')." },
      { key: "complemento", label: "Complemento", format: "text", description: "Complemento (apto, bloco, casa), se houver." },
      { key: "bairro", label: "Bairro", format: "text", description: "Bairro." },
      { key: "cidade", label: "Cidade", format: "text", description: "Município." },
      { key: "uf", label: "UF", format: "uf", description: "Sigla do estado." },
      { key: "cep", label: "CEP", format: "cep", description: "CEP (8 dígitos)." },
      { key: "data_emissao", label: "Data de emissão", format: "date", description: "Data de emissão do comprovante." },
    ],
  },
  dados_bancarios: {
    docType: "dados_bancarios",
    title: "Dados bancários (cartão, comprovante/extrato, print de aplicativo, declaração ou chave PIX)",
    guidance:
      "Os dados podem pertencer ao motorista ou a uma empresa (CNPJ). Não deduza o código do banco a partir do nome se ele não estiver visível — deixe vazio. Separe o dígito da conta quando estiver indicado com hífen. Tipo de conta: 'corrente', 'poupanca', 'pagamento' ou 'salario'. Tipo de chave PIX: 'cpf', 'cnpj', 'email', 'telefone' ou 'aleatoria'.",
    fields: [
      { key: "banco_nome", label: "Banco", format: "text", description: "Nome da instituição financeira." },
      { key: "banco_codigo", label: "Código do banco", format: "digits", description: "Código COMPE de 3 dígitos, somente se impresso." },
      { key: "agencia", label: "Agência", format: "text", description: "Número da agência (com dígito, se houver)." },
      { key: "conta", label: "Conta", format: "text", description: "Número da conta sem o dígito verificador." },
      { key: "conta_digito", label: "Dígito da conta", format: "text", description: "Dígito verificador da conta." },
      { key: "tipo_conta", label: "Tipo de conta", format: "enum", options: ["corrente", "poupanca", "pagamento", "salario"], description: "Tipo da conta." },
      { key: "titular_nome", label: "Titular", format: "name", description: "Nome ou razão social do titular da conta." },
      { key: "titular_documento", label: "CPF/CNPJ do titular", format: "cpf_cnpj", description: "CPF ou CNPJ do titular." },
      { key: "pix_tipo", label: "Tipo de chave PIX", format: "enum", options: ["cpf", "cnpj", "email", "telefone", "aleatoria"], description: "Tipo da chave PIX." },
      { key: "pix_chave", label: "Chave PIX", format: "text", description: "Chave PIX exatamente como aparece." },
    ],
  },
  crlv: {
    docType: "crlv",
    title: "CRLV / CRLV-e — Certificado de Registro e Licenciamento de Veículo",
    guidance:
      "O campo 'MARCA/MODELO/VERSÃO' costuma vir junto (ex.: 'VW/24.280 CRM 6X2'): separe a marca (antes da barra) do modelo/versão. 'CAPACIDADE' pode vir em toneladas e 'CAP/POT/CIL' combina capacidade, potência e cilindrada — informe a capacidade exatamente como impressa. 'ESPÉCIE/TIPO' (ex.: 'CARGA/CAMINHÃO'), 'CATEGORIA' (ex.: 'PARTICULAR', 'ALUGUEL'). Placas podem estar no padrão antigo (ABC1234) ou Mercosul (ABC1D23).",
    fields: [
      { key: "placa", label: "Placa", format: "placa", description: "Placa do veículo." },
      { key: "renavam", label: "Renavam", format: "renavam", description: "Código RENAVAM (9 a 11 dígitos)." },
      { key: "numero_crv", label: "Nº do CRV", format: "digits", description: "Número do CRV/segurança, se presente." },
      { key: "marca", label: "Marca", format: "text", description: "Marca/fabricante." },
      { key: "modelo", label: "Modelo", format: "text", description: "Modelo e versão." },
      { key: "ano_fabricacao", label: "Ano de fabricação", format: "year", description: "Ano de fabricação (4 dígitos)." },
      { key: "ano_modelo", label: "Ano do modelo", format: "year", description: "Ano do modelo (4 dígitos)." },
      { key: "chassi", label: "Chassi", format: "chassi", description: "Número do chassi/VIN (17 caracteres)." },
      { key: "cor", label: "Cor", format: "text", description: "Cor predominante." },
      { key: "combustivel", label: "Combustível", format: "text", description: "Combustível (ex.: DIESEL)." },
      { key: "categoria", label: "Categoria", format: "text", description: "Categoria do veículo (ex.: PARTICULAR, ALUGUEL)." },
      { key: "especie_tipo", label: "Espécie/Tipo", format: "text", description: "Espécie e tipo (ex.: CARGA/CAMINHÃO TRATOR)." },
      { key: "carroceria", label: "Carroceria", format: "text", description: "Tipo de carroceria, se indicado (ex.: FECHADA/BAÚ)." },
      { key: "capacidade", label: "Capacidade", format: "text", description: "Capacidade de carga como impressa (ex.: '14.5T')." },
      { key: "pbt", label: "PBT", format: "text", description: "Peso bruto total, se indicado." },
      { key: "eixos", label: "Eixos", format: "digits", description: "Quantidade de eixos, se indicada." },
      { key: "proprietario_nome", label: "Proprietário", format: "name", description: "Nome do proprietário." },
      { key: "proprietario_documento", label: "CPF/CNPJ do proprietário", format: "cpf_cnpj", description: "CPF ou CNPJ do proprietário." },
      { key: "municipio", label: "Município", format: "text", description: "Município de registro/emplacamento." },
      { key: "uf", label: "UF", format: "uf", description: "UF de registro." },
      { key: "exercicio", label: "Exercício", format: "year", description: "Ano de exercício do licenciamento." },
      { key: "data_emissao", label: "Data de emissão", format: "date", description: "Data de emissão do CRLV." },
    ],
  },
  antt: {
    docType: "antt",
    title: "Documento ANTT / RNTRC (certificado, extrato ou consulta pública do transportador)",
    guidance:
      "Os documentos da ANTT variam muito de layout. Extraia apenas o que estiver expressamente presente. 'tipo_transportador' é a sigla TAC (Transportador Autônomo de Cargas), ETC (Empresa de Transporte de Cargas) ou CTC (Cooperativa de Transporte de Cargas). Se houver lista de veículos, informe em 'placa' apenas a placa do veículo principal do documento, quando houver uma única placa.",
    fields: [
      { key: "rntrc", label: "RNTRC", format: "digits", description: "Número do RNTRC." },
      { key: "transportador_nome", label: "Transportador", format: "name", description: "Nome ou razão social do transportador." },
      { key: "transportador_documento", label: "CPF/CNPJ do transportador", format: "cpf_cnpj", description: "CPF ou CNPJ do transportador." },
      { key: "categoria", label: "Categoria do transportador", format: "text", description: "Categoria por extenso, como impressa." },
      { key: "tipo_transportador", label: "TAC / ETC / CTC", format: "enum", options: ["TAC", "ETC", "CTC"], description: "Sigla do tipo de transportador." },
      { key: "situacao", label: "Situação cadastral", format: "text", description: "Situação do registro (ex.: ATIVO), somente se expressa." },
      { key: "data_emissao", label: "Data de emissão", format: "date", description: "Data de emissão/consulta." },
      { key: "data_validade", label: "Validade", format: "date", description: "Data de validade, somente se indicada." },
      { key: "placa", label: "Placa citada", format: "placa", description: "Placa do veículo citada no documento, se houver uma única." },
    ],
  },
  foto_veiculo: {
    docType: "foto_veiculo",
    title: "Fotografia do veículo",
    guidance:
      "Descreva apenas o que é visível. Essas informações são sugestões visuais e nunca substituem documentos oficiais. 'tipo_veiculo' deve ser um de: 'Tração (cavalo mecânico)', 'Caminhão rígido', 'Reboque', 'Semirreboque', 'Utilitário/VUC'. 'tipo_rodado' quando identificável: 'VUC', '3/4', 'Toco', 'Truck', 'Bitruck', 'Carreta', 'Bitrem', 'Rodotrem'. Só informe a placa se estiver totalmente legível.",
    fields: [
      { key: "tipo_veiculo", label: "Tipo de veículo aparente", format: "text", description: "Tipo de veículo aparente." },
      { key: "tipo_rodado", label: "Rodado aparente", format: "text", description: "Configuração de rodado aparente." },
      { key: "carroceria", label: "Carroceria aparente", format: "text", description: "Tipo de carroceria aparente (baú, sider, graneleiro, tanque etc.)." },
      { key: "cor", label: "Cor aparente", format: "text", description: "Cor predominante da cabine." },
      { key: "eixos", label: "Eixos visíveis", format: "digits", description: "Quantidade de eixos visíveis, se for possível contar com segurança." },
      { key: "placa_visivel", label: "Placa visível", format: "placa", description: "Placa, somente se totalmente legível na foto." },
      { key: "caracteristicas", label: "Características visuais", format: "text", description: "Descrição objetiva (até 200 caracteres) de características visuais relevantes." },
    ],
  },
};

export type ExtractableDocType = keyof typeof EXTRACTION_SCHEMAS;

export function getDocSchema(docType: DocType): DocSchema | null {
  return EXTRACTION_SCHEMAS[docType] ?? null;
}
