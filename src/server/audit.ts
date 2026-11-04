import "server-only";
import { db } from "./db";
import { auditLogs } from "./db/schema";

/** Chaves que nunca devem chegar ao log, independentemente do contexto. */
const FORBIDDEN_KEYS = /cpf|cnpj|rg$|^rg|pix|conta|agencia|senha|password|token|documento|chave|email|telefone|value|valor/i;

/**
 * Remove qualquer conteúdo potencialmente sensível dos detalhes do log.
 * Mantém apenas estruturas simples (nomes de campos, tipos, contagens, IDs).
 */
export function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (Array.isArray(v)) out[k] = v.slice(0, 100).map((x) => (typeof x === "object" && x !== null ? sanitizeDetails(x as Record<string, unknown>) : typeof x === "string" ? x.slice(0, 120) : x));
    else if (typeof v === "object") out[k] = sanitizeDetails(v as Record<string, unknown>);
  }
  return out;
}

export async function audit(args: {
  user: { id: string; name: string } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: args.user?.id ?? null,
      userName: args.user?.name ?? null,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId ?? null,
      details: sanitizeDetails(args.details ?? {}),
      ip: args.ip ?? null,
    });
  } catch (err) {
    // Falha de auditoria não deve derrubar a operação, mas precisa ser visível.
    console.error("[audit] falha ao registrar:", args.action, (err as Error).message);
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Entrou no sistema",
  "auth.login_failed": "Tentativa de login falhou",
  "auth.logout": "Saiu do sistema",
  "auth.password_changed": "Alterou a senha",
  "record.draft_created": "Iniciou cadastro",
  "record.finalized": "Salvou ficha",
  "record.updated": "Editou ficha",
  "record.archived": "Moveu para a lixeira",
  "record.restored": "Restaurou da lixeira",
  "record.purged": "Excluiu definitivamente",
  "record.sensitive_revealed": "Visualizou dados sensíveis",
  "document.uploaded": "Enviou documento",
  "document.replaced": "Substituiu documento",
  "document.removed": "Removeu documento",
  "document.viewed": "Visualizou documento",
  "ai.processed": "Processou documentos com IA",
  "pdf.generated": "Gerou PDF da ficha",
  "pdf.downloaded": "Baixou PDF da ficha",
  "export.csv": "Exportou listagem",
  "settings.updated": "Alterou configurações",
  "settings.logo_updated": "Alterou logotipo",
  "settings.external_ai": "Alterou autorização de IA externa",
  "user.created": "Criou usuário",
  "user.updated": "Alterou usuário",
  "user.password_reset": "Redefiniu senha de usuário",
  "maintenance.retention": "Executou rotina de retenção",
};
