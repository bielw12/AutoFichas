export type Role = "admin" | "operador" | "visualizador";

export const ROLES: Role[] = ["admin", "operador", "visualizador"];

export const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  admin: { label: "Administrador", description: "Acesso integral: configurações, usuários, exclusões e lixeira." },
  operador: { label: "Operador", description: "Cria, visualiza e edita fichas; processa documentos com IA." },
  visualizador: { label: "Visualizador", description: "Somente consulta e download, com dados sensíveis mascarados." },
};

export type Permission =
  | "records.read"
  | "records.create"
  | "records.edit"
  | "records.delete"
  | "records.purge"
  | "records.saveIncomplete"
  | "documents.read"
  | "documents.upload"
  | "ai.process"
  | "pdf.generate"
  | "pdf.download"
  | "sensitive.reveal"
  | "export.basic"
  | "export.full"
  | "settings.manage"
  | "users.manage"
  | "audit.read";

const MATRIX: Record<Role, Permission[]> = {
  admin: [
    "records.read", "records.create", "records.edit", "records.delete", "records.purge", "records.saveIncomplete",
    "documents.read", "documents.upload", "ai.process", "pdf.generate", "pdf.download", "sensitive.reveal",
    "export.basic", "export.full", "settings.manage", "users.manage", "audit.read",
  ],
  operador: [
    "records.read", "records.create", "records.edit", "documents.read", "documents.upload", "ai.process",
    "pdf.generate", "pdf.download", "sensitive.reveal", "export.basic",
  ],
  visualizador: ["records.read", "documents.read", "pdf.download", "export.basic"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}
