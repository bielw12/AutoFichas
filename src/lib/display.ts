import type { RecordFieldDef } from "./fields";
import { formatCEP, formatCPF, formatCpfCnpj, formatDateBR, formatNumberBR, formatPhone, formatPlaca, maskCpfCnpj, maskPix, maskTail } from "./format";

/** Formata um valor armazenado para exibição (tela e PDF). */
export function formatValue(def: Pick<RecordFieldDef, "input" | "options" | "key">, value: string | null | undefined): string {
  const v = (value ?? "").toString();
  if (!v) return "";
  switch (def.input) {
    case "cpf":
      return formatCPF(v);
    case "cpf_cnpj":
      return formatCpfCnpj(v);
    case "cep":
      return formatCEP(v);
    case "phone":
      return formatPhone(v);
    case "date":
      return formatDateBR(v);
    case "placa":
      return formatPlaca(v);
    case "number":
      return formatNumberBR(v, 2);
    case "select":
      return def.options?.find((o) => o.value === v)?.label ?? v;
    default:
      return v;
  }
}

/** Versão mascarada para perfis/visões que não precisam do dado completo. */
export function maskValue(def: Pick<RecordFieldDef, "input" | "key">, value: string | null | undefined): string {
  const v = (value ?? "").toString();
  if (!v) return "";
  if (def.input === "cpf" || def.input === "cpf_cnpj") return maskCpfCnpj(v);
  if (def.key === "pixChave") return maskPix(v);
  if (def.key === "rg") return maskTail(v, 2);
  return maskTail(v, 2);
}
