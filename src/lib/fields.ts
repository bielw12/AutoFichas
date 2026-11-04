import type { DocType, RecordKind } from "./doc-types";
import { CNH_CATEGORIES, UFS } from "./validators";

export type InputKind =
  | "text"
  | "cpf"
  | "cpf_cnpj"
  | "date"
  | "uf"
  | "cep"
  | "phone"
  | "email"
  | "placa"
  | "renavam"
  | "chassi"
  | "cnh_registro"
  | "year"
  | "number"
  | "digits"
  | "select"
  | "combo"
  | "textarea";

export type TransformName = "tonsToKg" | "upper" | "none";

export interface FieldSource {
  docType: DocType;
  field: string;
  transform?: TransformName;
  /** Valores desta origem sempre exigem conferência humana (amarelo). */
  alwaysReview?: string;
}

export interface RecordFieldDef {
  key: string;
  label: string;
  section: string;
  input: InputKind;
  options?: { value: string; label: string }[];
  suggestions?: string[];
  /** Necessário para o cadastro ser considerado completo. */
  required?: boolean;
  /** Dado pessoal/financeiro: mascarado em listagens e para perfis sem permissão. */
  sensitive?: boolean;
  wide?: boolean;
  placeholder?: string;
  help?: string;
  sources?: FieldSource[];
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
}

const UF_OPTIONS = UFS.map((u) => ({ value: u, label: u }));

// ------------------------------------------------------------------ Motorista

export const DRIVER_SECTIONS: SectionDef[] = [
  { id: "pessoais", title: "Informações pessoais" },
  { id: "cnh", title: "Informações da CNH" },
  {
    id: "endereco",
    title: "Endereço",
    description: "Extraído do comprovante de residência. O titular do comprovante pode ser outra pessoa — confira.",
  },
  { id: "contato", title: "Contato" },
  {
    id: "bancarios",
    title: "Dados bancários",
    description: "Indique a quem pertencem os dados (motorista, empresa responsável pelo pagamento ou terceiro).",
  },
  { id: "observacoes", title: "Observações" },
];

export const DRIVER_FIELDS: RecordFieldDef[] = [
  { key: "nome", label: "Nome completo", section: "pessoais", input: "text", required: true, wide: true, sources: [{ docType: "cnh", field: "nome" }] },
  { key: "cpf", label: "CPF", section: "pessoais", input: "cpf", required: true, sensitive: true, sources: [{ docType: "cnh", field: "cpf" }] },
  { key: "rg", label: "RG", section: "pessoais", input: "text", sensitive: true, sources: [{ docType: "cnh", field: "rg" }] },
  { key: "dataNascimento", label: "Data de nascimento", section: "pessoais", input: "date", sources: [{ docType: "cnh", field: "data_nascimento" }] },
  { key: "naturalidade", label: "Naturalidade", section: "pessoais", input: "text", placeholder: "Cidade, UF", sources: [{ docType: "cnh", field: "naturalidade" }] },

  { key: "cnhNumero", label: "Número da CNH", section: "cnh", input: "digits", required: true, sources: [{ docType: "cnh", field: "numero_cnh" }] },
  { key: "cnhRegistro", label: "Registro", section: "cnh", input: "cnh_registro", required: true, sources: [{ docType: "cnh", field: "registro" }] },
  { key: "cnhCategoria", label: "Categoria", section: "cnh", input: "select", required: true, options: CNH_CATEGORIES.map((c) => ({ value: c, label: c })), sources: [{ docType: "cnh", field: "categoria" }] },
  { key: "cnhEmissao", label: "Emissão", section: "cnh", input: "date", sources: [{ docType: "cnh", field: "data_emissao" }] },
  { key: "cnhValidade", label: "Validade", section: "cnh", input: "date", required: true, sources: [{ docType: "cnh", field: "data_validade" }] },
  { key: "cnhPrimeiraHabilitacao", label: "Primeira habilitação", section: "cnh", input: "date", sources: [{ docType: "cnh", field: "primeira_habilitacao" }] },
  { key: "cnhUf", label: "UF", section: "cnh", input: "uf", options: UF_OPTIONS, sources: [{ docType: "cnh", field: "uf_emissao" }] },
  { key: "cnhObservacoes", label: "Observações da CNH", section: "cnh", input: "text", wide: true, placeholder: "Ex.: EAR", sources: [{ docType: "cnh", field: "observacoes" }] },

  { key: "cep", label: "CEP", section: "endereco", input: "cep", required: true, sources: [{ docType: "comprovante_residencia", field: "cep", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "logradouro", label: "Logradouro", section: "endereco", input: "text", required: true, wide: true, sources: [{ docType: "comprovante_residencia", field: "logradouro", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "numero", label: "Número", section: "endereco", input: "text", required: true, sources: [{ docType: "comprovante_residencia", field: "numero", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "complemento", label: "Complemento", section: "endereco", input: "text", sources: [{ docType: "comprovante_residencia", field: "complemento", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "bairro", label: "Bairro", section: "endereco", input: "text", required: true, sources: [{ docType: "comprovante_residencia", field: "bairro", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "cidade", label: "Cidade", section: "endereco", input: "text", required: true, sources: [{ docType: "comprovante_residencia", field: "cidade", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "uf", label: "Estado", section: "endereco", input: "uf", required: true, options: UF_OPTIONS, sources: [{ docType: "comprovante_residencia", field: "uf", alwaysReview: "Endereço do comprovante — confirme se pertence ao motorista." }] },
  { key: "enderecoTitular", label: "Titular do comprovante", section: "endereco", input: "text", sources: [{ docType: "comprovante_residencia", field: "titular_nome" }] },
  {
    key: "enderecoVinculo",
    label: "Vínculo do titular",
    section: "endereco",
    input: "select",
    options: [
      { value: "proprio", label: "O próprio motorista" },
      { value: "familiar", label: "Familiar / cônjuge" },
      { value: "terceiro", label: "Terceiro (declaração)" },
    ],
  },
  { key: "comprovanteEmissao", label: "Emissão do comprovante", section: "endereco", input: "date", sources: [{ docType: "comprovante_residencia", field: "data_emissao" }] },

  { key: "telefonePrincipal", label: "Telefone principal", section: "contato", input: "phone", required: true },
  { key: "contatoComercialNome", label: "Nome do contato comercial", section: "contato", input: "text" },
  { key: "telefoneSecundario", label: "Telefone secundário", section: "contato", input: "phone" },
  { key: "contatoOperacionalNome", label: "Nome do contato operacional", section: "contato", input: "text" },
  { key: "email", label: "E-mail", section: "contato", input: "email" },
  { key: "contatoAdicional", label: "Contato adicional", section: "contato", input: "text", placeholder: "Nome, telefone ou observação" },

  { key: "bancoNome", label: "Banco", section: "bancarios", input: "text", sources: [{ docType: "dados_bancarios", field: "banco_nome" }] },
  { key: "bancoCodigo", label: "Código do banco", section: "bancarios", input: "digits", sources: [{ docType: "dados_bancarios", field: "banco_codigo" }] },
  { key: "agencia", label: "Agência", section: "bancarios", input: "text", sensitive: true, sources: [{ docType: "dados_bancarios", field: "agencia" }] },
  { key: "conta", label: "Conta", section: "bancarios", input: "text", sensitive: true, sources: [{ docType: "dados_bancarios", field: "conta" }] },
  { key: "contaDigito", label: "Dígito", section: "bancarios", input: "text", sensitive: true, sources: [{ docType: "dados_bancarios", field: "conta_digito" }] },
  {
    key: "contaTipo",
    label: "Tipo de conta",
    section: "bancarios",
    input: "select",
    options: [
      { value: "corrente", label: "Conta corrente" },
      { value: "poupanca", label: "Poupança" },
      { value: "pagamento", label: "Conta de pagamento" },
      { value: "salario", label: "Conta salário" },
    ],
    sources: [{ docType: "dados_bancarios", field: "tipo_conta" }],
  },
  { key: "titularNome", label: "Titular", section: "bancarios", input: "text", wide: true, sources: [{ docType: "dados_bancarios", field: "titular_nome" }] },
  { key: "titularDocumento", label: "CPF/CNPJ do titular", section: "bancarios", input: "cpf_cnpj", sensitive: true, sources: [{ docType: "dados_bancarios", field: "titular_documento" }] },
  {
    key: "titularVinculo",
    label: "Dados pertencem a",
    section: "bancarios",
    input: "select",
    options: [
      { value: "motorista", label: "Motorista" },
      { value: "empresa", label: "Empresa responsável pelo pagamento" },
      { value: "terceiro", label: "Terceiro" },
    ],
  },
  {
    key: "pixTipo",
    label: "Tipo da chave PIX",
    section: "bancarios",
    input: "select",
    options: [
      { value: "cpf", label: "CPF" },
      { value: "cnpj", label: "CNPJ" },
      { value: "email", label: "E-mail" },
      { value: "telefone", label: "Telefone" },
      { value: "aleatoria", label: "Chave aleatória" },
    ],
    sources: [{ docType: "dados_bancarios", field: "pix_tipo" }],
  },
  { key: "pixChave", label: "Chave PIX", section: "bancarios", input: "text", sensitive: true, wide: true, sources: [{ docType: "dados_bancarios", field: "pix_chave" }] },

  { key: "observacoes", label: "Observações", section: "observacoes", input: "textarea", wide: true, placeholder: "Informações adicionais relevantes para a operação" },
];

// -------------------------------------------------------------------- Veículo

export const VEHICLE_TYPE_SUGGESTIONS = ["Tração (cavalo mecânico)", "Caminhão rígido", "Reboque", "Semirreboque", "Utilitário/VUC"];
export const RODADO_SUGGESTIONS = ["VUC", "3/4", "Toco", "Truck", "Bitruck", "Carreta", "Carreta LS", "Bitrem", "Rodotrem", "Vanderleia"];
export const CARROCERIA_SUGGESTIONS = ["Baú", "Baú refrigerado", "Sider", "Graneleiro", "Grade baixa", "Prancha", "Tanque", "Caçamba", "Porta-contêiner", "Cegonha", "Sem carroceria"];
export const TAG_SUGGESTIONS = ["Sem Parar", "ConectCar", "Veloe", "Move Mais", "Taggy", "Outra", "Não possui"];

export const VEHICLE_SECTIONS: SectionDef[] = [
  { id: "identificacao", title: "Identificação do veículo" },
  {
    id: "operacional",
    title: "Características operacionais",
    description: "Sugestões vindas da foto são apenas indicativas — confirme com a documentação.",
  },
  { id: "documentacao", title: "Documentação" },
  { id: "proprietario", title: "Proprietário" },
  { id: "observacoes", title: "Observações" },
];

const PHOTO_REVIEW = "Sugestão baseada na foto do veículo — não substitui o documento oficial.";

export const VEHICLE_FIELDS: RecordFieldDef[] = [
  { key: "marca", label: "Marca", section: "identificacao", input: "text", required: true, sources: [{ docType: "crlv", field: "marca" }] },
  { key: "modelo", label: "Modelo", section: "identificacao", input: "text", required: true, wide: true, sources: [{ docType: "crlv", field: "modelo" }] },
  { key: "placa", label: "Placa", section: "identificacao", input: "placa", required: true, sources: [{ docType: "crlv", field: "placa" }, { docType: "antt", field: "placa", alwaysReview: "Placa encontrada no documento ANTT." }] },
  { key: "renavam", label: "Renavam", section: "identificacao", input: "renavam", required: true, sources: [{ docType: "crlv", field: "renavam" }] },
  { key: "chassi", label: "Chassi", section: "identificacao", input: "chassi", required: true, sources: [{ docType: "crlv", field: "chassi" }] },
  { key: "anoFabricacao", label: "Ano de fabricação", section: "identificacao", input: "year", sources: [{ docType: "crlv", field: "ano_fabricacao" }] },
  { key: "anoModelo", label: "Ano do modelo", section: "identificacao", input: "year", sources: [{ docType: "crlv", field: "ano_modelo" }] },
  { key: "cor", label: "Cor", section: "identificacao", input: "text", sources: [{ docType: "crlv", field: "cor" }, { docType: "foto_veiculo", field: "cor", alwaysReview: PHOTO_REVIEW }] },
  { key: "combustivel", label: "Combustível", section: "identificacao", input: "text", sources: [{ docType: "crlv", field: "combustivel" }] },
  { key: "especieTipo", label: "Espécie / tipo (CRLV)", section: "identificacao", input: "text", sources: [{ docType: "crlv", field: "especie_tipo" }] },
  { key: "crlvCategoria", label: "Categoria (CRLV)", section: "identificacao", input: "text", sources: [{ docType: "crlv", field: "categoria" }] },
  { key: "numeroCrv", label: "Nº do CRV", section: "identificacao", input: "digits", sources: [{ docType: "crlv", field: "numero_crv" }] },
  { key: "municipio", label: "Município de registro", section: "identificacao", input: "text", sources: [{ docType: "crlv", field: "municipio" }] },
  { key: "ufRegistro", label: "UF de registro", section: "identificacao", input: "uf", options: UF_OPTIONS, sources: [{ docType: "crlv", field: "uf" }] },

  { key: "capacidadeCargaKg", label: "Capacidade de carga (kg)", section: "operacional", input: "number", required: true, sources: [{ docType: "crlv", field: "capacidade", transform: "tonsToKg", alwaysReview: "Convertido da capacidade indicada no CRLV — confira a unidade." }] },
  { key: "cubagemM3", label: "Cubagem (m³)", section: "operacional", input: "number" },
  { key: "tipoVeiculo", label: "Tipo de veículo", section: "operacional", input: "combo", required: true, suggestions: VEHICLE_TYPE_SUGGESTIONS, sources: [{ docType: "foto_veiculo", field: "tipo_veiculo", alwaysReview: PHOTO_REVIEW }] },
  { key: "tipoRodado", label: "Tipo de rodado", section: "operacional", input: "combo", required: true, suggestions: RODADO_SUGGESTIONS, sources: [{ docType: "foto_veiculo", field: "tipo_rodado", alwaysReview: PHOTO_REVIEW }] },
  { key: "tipoCarroceria", label: "Tipo de carroceria", section: "operacional", input: "combo", suggestions: CARROCERIA_SUGGESTIONS, sources: [{ docType: "crlv", field: "carroceria" }, { docType: "foto_veiculo", field: "carroceria", alwaysReview: PHOTO_REVIEW }] },
  { key: "eixos", label: "Quantidade de eixos", section: "operacional", input: "number", sources: [{ docType: "crlv", field: "eixos" }, { docType: "foto_veiculo", field: "eixos", alwaysReview: PHOTO_REVIEW }] },
  { key: "tagPedagioOperadora", label: "Tag de pedágio", section: "operacional", input: "combo", suggestions: TAG_SUGGESTIONS },
  { key: "tagPedagioNumero", label: "Número da tag", section: "operacional", input: "text" },
  { key: "caracteristicasVisuais", label: "Características visuais (sugestão da foto)", section: "operacional", input: "text", wide: true, sources: [{ docType: "foto_veiculo", field: "caracteristicas", alwaysReview: PHOTO_REVIEW }] },

  { key: "rntrc", label: "Número RNTRC", section: "documentacao", input: "digits", required: true, sources: [{ docType: "antt", field: "rntrc" }] },
  { key: "anttTipo", label: "Categoria ANTT", section: "documentacao", input: "select", options: [{ value: "TAC", label: "TAC — Autônomo" }, { value: "ETC", label: "ETC — Empresa" }, { value: "CTC", label: "CTC — Cooperativa" }], sources: [{ docType: "antt", field: "tipo_transportador" }] },
  { key: "anttCategoria", label: "Categoria (por extenso)", section: "documentacao", input: "text", sources: [{ docType: "antt", field: "categoria" }] },
  { key: "anttSituacao", label: "Situação cadastral", section: "documentacao", input: "text", sources: [{ docType: "antt", field: "situacao" }] },
  { key: "anttTransportadorNome", label: "Transportador (ANTT)", section: "documentacao", input: "text", wide: true, sources: [{ docType: "antt", field: "transportador_nome" }] },
  { key: "anttTransportadorDocumento", label: "CPF/CNPJ do transportador", section: "documentacao", input: "cpf_cnpj", sensitive: true, sources: [{ docType: "antt", field: "transportador_documento" }] },
  { key: "anttEmissao", label: "Emissão ANTT", section: "documentacao", input: "date", sources: [{ docType: "antt", field: "data_emissao" }] },
  { key: "anttValidade", label: "Validade ANTT", section: "documentacao", input: "date", help: "Preencha somente se indicada no documento.", sources: [{ docType: "antt", field: "data_validade" }] },
  { key: "crlvExercicio", label: "Exercício do CRLV", section: "documentacao", input: "year", sources: [{ docType: "crlv", field: "exercicio" }] },
  { key: "licenciamentoValidade", label: "Licenciamento válido até", section: "documentacao", input: "date", help: "Opcional. Usado nos alertas de vencimento." },

  { key: "proprietarioNome", label: "Nome ou razão social", section: "proprietario", input: "text", required: true, wide: true, sources: [{ docType: "crlv", field: "proprietario_nome" }] },
  { key: "proprietarioDocumento", label: "CPF/CNPJ", section: "proprietario", input: "cpf_cnpj", required: true, sensitive: true, sources: [{ docType: "crlv", field: "proprietario_documento" }] },
  { key: "proprietarioInfo", label: "Informações adicionais", section: "proprietario", input: "text", wide: true, placeholder: "Ex.: arrendatário, contato do proprietário" },

  { key: "observacoes", label: "Observações", section: "observacoes", input: "textarea", wide: true },
];

export const FIELDS: Record<RecordKind, RecordFieldDef[]> = { driver: DRIVER_FIELDS, vehicle: VEHICLE_FIELDS };
export const SECTIONS: Record<RecordKind, SectionDef[]> = { driver: DRIVER_SECTIONS, vehicle: VEHICLE_SECTIONS };

export function fieldDef(kind: RecordKind, key: string): RecordFieldDef | undefined {
  return FIELDS[kind].find((f) => f.key === key);
}

export function fieldKeys(kind: RecordKind): string[] {
  return FIELDS[kind].map((f) => f.key);
}

export function fieldLabel(kind: RecordKind, key: string): string {
  return fieldDef(kind, key)?.label ?? key;
}

export function isSensitiveField(kind: RecordKind, key: string): boolean {
  return !!fieldDef(kind, key)?.sensitive;
}

export type FormValues = Record<string, string>;

export function emptyValues(kind: RecordKind): FormValues {
  return Object.fromEntries(fieldKeys(kind).map((k) => [k, ""]));
}

/** Campos usados para cálculo de vencimento. */
export const EXPIRY_FIELDS: Record<RecordKind, { key: string; label: string }[]> = {
  driver: [{ key: "cnhValidade", label: "CNH" }],
  vehicle: [
    { key: "anttValidade", label: "ANTT/RNTRC" },
    { key: "licenciamentoValidade", label: "Licenciamento (CRLV)" },
  ],
};

/** Identificadores para checagem de duplicidade. */
export const DUPLICATE_KEYS: Record<RecordKind, { key: string; label: string }[]> = {
  driver: [{ key: "cpf", label: "CPF" }],
  vehicle: [
    { key: "placa", label: "Placa" },
    { key: "renavam", label: "Renavam" },
  ],
};

export function recordTitle(kind: RecordKind, v: Partial<FormValues>): string {
  if (kind === "driver") return v.nome?.trim() || "Motorista sem nome";
  const name = [v.marca, v.modelo].filter(Boolean).join(" ").trim();
  return name || v.placa || "Veículo sem identificação";
}
