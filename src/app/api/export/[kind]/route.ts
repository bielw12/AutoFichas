import { NextResponse } from "next/server";
import { isRecordKind, KIND_LABELS } from "@/lib/doc-types";
import { formatCEP, formatCPF, formatCpfCnpj, formatDateBR, formatDateTimeBR, formatPhone, formatPlaca, maskCPF, maskCpfCnpj } from "@/lib/format";
import { can } from "@/lib/permissions";
import { STATUS_INFO } from "@/lib/status";
import { audit } from "@/server/audit";
import { clientIp, requireUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { listRecords, type SortKey } from "@/server/services/records";

export const runtime = "nodejs";

function csvCell(v: unknown): string {
  let s = String(v ?? "");
  // Proteção contra injeção de fórmulas em planilhas
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporta a listagem filtrada em CSV (separador ";" e BOM UTF-8 — abre
 * diretamente no Excel em português). Dados pessoais saem mascarados, exceto
 * para administradores que solicitarem explicitamente a exportação completa.
 * Dados bancários nunca são exportados.
 */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  try {
    const user = await requireUser("export.basic");
    const { kind } = await ctx.params;
    if (!isRecordKind(kind)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "1" && can(user.role, "export.full");

    const rows: string[][] = [];
    let page = 1;
    for (;;) {
      const res = await listRecords(kind, {
        q: url.searchParams.get("q") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        sort: (url.searchParams.get("sort") as SortKey) ?? undefined,
        page,
        pageSize: 200,
      });
      for (const { values: v, status, row } of res.items) {
        if (kind === "driver") {
          rows.push([
            v.nome,
            full ? formatCPF(v.cpf) : maskCPF(v.cpf),
            v.cnhNumero,
            v.cnhRegistro,
            v.cnhCategoria,
            formatDateBR(v.cnhValidade),
            formatPhone(v.telefonePrincipal),
            v.cidade,
            v.uf,
            full ? formatCEP(v.cep) : "",
            STATUS_INFO[status].label,
            formatDateTimeBR(row.updatedAt),
          ]);
        } else {
          rows.push([
            [v.marca, v.modelo].filter(Boolean).join(" "),
            formatPlaca(v.placa),
            v.renavam,
            v.chassi,
            v.anoFabricacao && v.anoModelo ? `${v.anoFabricacao}/${v.anoModelo}` : v.anoFabricacao || v.anoModelo,
            v.tipoVeiculo,
            v.tipoRodado,
            v.capacidadeCargaKg,
            v.cubagemM3,
            v.rntrc,
            v.proprietarioNome,
            full ? formatCpfCnpj(v.proprietarioDocumento) : maskCpfCnpj(v.proprietarioDocumento),
            formatDateBR(v.anttValidade),
            STATUS_INFO[status].label,
            formatDateTimeBR(row.updatedAt),
          ]);
        }
      }
      if (page >= res.pages || page >= 50) break;
      page++;
    }

    const header =
      kind === "driver"
        ? ["Nome", "CPF", "Nº CNH", "Registro CNH", "Categoria", "Validade CNH", "Telefone", "Cidade", "UF", "CEP", "Situação", "Atualizado em"]
        : ["Veículo", "Placa", "Renavam", "Chassi", "Ano fab./mod.", "Tipo", "Rodado", "Capacidade (kg)", "Cubagem (m³)", "RNTRC", "Proprietário", "CPF/CNPJ proprietário", "Validade ANTT", "Situação", "Atualizado em"];
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    await audit({ user, action: "export.csv", entityType: kind, details: { linhas: rows.length, completo: full }, ip: await clientIp() });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${KIND_LABELS[kind].slug}-${date}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
