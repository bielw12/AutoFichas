import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verificação de saúde para balanceadores/monitoramento (sem dados sensíveis). */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
