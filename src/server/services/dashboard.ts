import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { RecordKind } from "@/lib/doc-types";
import { recordTitle } from "@/lib/fields";
import { expiryInfo, type RecordStatus } from "@/lib/status";
import { addDaysISO, todayISO } from "@/lib/validators";
import { db } from "../db";
import { drivers, users, vehicles } from "../db/schema";
import { effectiveStatusSql, rowToValues, tableFor, type AnyRecordRow } from "./records";
import { getSettings } from "./settings";

async function countsFor(kind: RecordKind, warningDays: number) {
  const t = tableFor(kind);
  const st = effectiveStatusSql(kind, warningDays);
  const rows = await db
    .select({ status: st, count: sql<number>`count(*)::int` })
    .from(t)
    .where(and(isNull(t.archivedAt), eq(t.isDraft, false)))
    // Agrupa pela posição: a expressão parametrizada não é reconhecida como idêntica no GROUP BY
    .groupBy(sql`1`);
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = r.count;
  const total = rows.reduce((a, r) => a + r.count, 0);
  const since = new Date(Date.now() - 7 * 86400000);
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(t)
    .where(and(isNull(t.archivedAt), eq(t.isDraft, false), gte(t.createdAt, since)));
  const [{ drafts }] = await db
    .select({ drafts: sql<number>`count(*)::int` })
    .from(t)
    .where(and(isNull(t.archivedAt), eq(t.isDraft, true)));
  return { total, by, recent, drafts };
}

export async function dashboardData() {
  const settings = await getSettings();
  const wd = settings.expiryWarningDays;
  const [d, v] = await Promise.all([countsFor("driver", wd), countsFor("vehicle", wd)]);
  const sum = (k: string) => (d.by[k] ?? 0) + (v.by[k] ?? 0);

  const recentRows = async (kind: RecordKind) => {
    const t = tableFor(kind);
    const st = effectiveStatusSql(kind, wd);
    const rows = await db
      .select({ row: t, status: st, userName: users.name })
      .from(t)
      .leftJoin(users, eq(users.id, t.updatedBy))
      .where(and(isNull(t.archivedAt), eq(t.isDraft, false)))
      .orderBy(desc(t.updatedAt))
      .limit(8);
    return rows.map((r) => {
      const row = r.row as AnyRecordRow;
      return {
        kind,
        id: row.id,
        title: recordTitle(kind, rowToValues(kind, row)),
        subtitle: kind === "driver" ? (row as typeof drivers.$inferSelect).cnhCategoria : (row as typeof vehicles.$inferSelect).placa,
        status: r.status as RecordStatus,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        version: row.currentVersion,
        userName: r.userName,
      };
    });
  };
  const [recentDrivers, recentVehicles] = await Promise.all([recentRows("driver"), recentRows("vehicle")]);
  const activity = [...recentDrivers, ...recentVehicles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  const limit = addDaysISO(todayISO(), wd);
  const [expDrivers, expVehicles] = await Promise.all([
    db
    .select()
    .from(drivers)
    .where(and(isNull(drivers.archivedAt), eq(drivers.isDraft, false), sql`${drivers.cnhValidade} <= ${limit}::date`))
    .orderBy(drivers.cnhValidade)
    .limit(10),
    db
    .select()
    .from(vehicles)
    .where(and(isNull(vehicles.archivedAt), eq(vehicles.isDraft, false), sql`least(${vehicles.anttValidade}, ${vehicles.licenciamentoValidade}) <= ${limit}::date`))
    .limit(10),
  ]);
  const expiring = [
    ...expDrivers.flatMap((r) =>
      expiryInfo("driver", rowToValues("driver", r), wd)
        .filter((e) => e.state !== "ok")
        .map((e) => ({ kind: "driver" as const, id: r.id, title: r.nome ?? "Motorista", ...e })),
    ),
    ...expVehicles.flatMap((r) =>
      expiryInfo("vehicle", rowToValues("vehicle", r), wd)
        .filter((e) => e.state !== "ok")
        .map((e) => ({ kind: "vehicle" as const, id: r.id, title: [r.placa, r.modelo].filter(Boolean).join(" · "), ...e })),
    ),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  return {
    totals: { drivers: d.total, vehicles: v.total },
    recent: d.recent + v.recent,
    incompletos: sum("incompleto") + sum("aguardando_conferencia"),
    pendentes: sum("documentacao_pendente") + sum("vencido"),
    vencidos: sum("vencido"),
    proximos: sum("proximo_vencimento"),
    drafts: d.drafts + v.drafts,
    byStatus: { driver: d.by, vehicle: v.by },
    activity,
    expiring,
    warningDays: wd,
  };
}
