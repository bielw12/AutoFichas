import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, ArrowRight, CalendarClock, ClipboardList, FileWarning, Plus, Sparkles, Truck, UserRound } from "lucide-react";
import { EmptyState, ExpiryBadge, PageHeader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { KIND_LABELS } from "@/lib/doc-types";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { dashboardData } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({
  label,
  value,
  icon: Icon,
  href,
  hint,
  tone = "brand",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  hint?: string;
  tone?: "brand" | "sun" | "red" | "orange";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 ring-brand-100",
    sun: "bg-sun-50 text-sun-600 ring-sun-200",
    red: "bg-red-50 text-red-600 ring-red-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
  };
  const body = (
    <Card className={cn("group h-full p-5 transition-colors", href && "hover:border-brand-200")}>
      <div className="flex items-start justify-between">
        <span className={cn("flex size-10 items-center justify-center rounded-xl ring-1", tones[tone])}>
          <Icon className="size-5" />
        </span>
        {href && <ArrowRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className="mt-4 text-[32px] font-extrabold leading-none tracking-tight tabular">{value.toLocaleString("pt-BR")}</div>
      <div className="mt-1.5 text-sm font-semibold text-ink-soft">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block focus-visible:rounded-[var(--radius-card)]">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requirePageUser();
  const { erro } = await searchParams;
  const d = await dashboardData();
  const canCreate = can(user.role, "records.create");
  const firstName = user.name.split(" ")[0];
  const split = (...keys: string[]) => {
    const n = (k: "driver" | "vehicle") => keys.reduce((a, s) => a + (d.byStatus[k][s] ?? 0), 0);
    return `${n("driver")} motorista(s) · ${n("vehicle")} veículo(s)`;
  };

  return (
    <>
      {erro === "permissao" && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Você não tem permissão para acessar a página solicitada.
        </div>
      )}
      <PageHeader
        eyebrow="Visão geral"
        title={`Olá, ${firstName}`}
        description="Acompanhe os cadastros, pendências e vencimentos da sua frota e dos seus motoristas."
        actions={
          canCreate && (
            <Button asChild variant="accent" size="lg">
              <Link href="/nova-ficha">
                <Plus /> Criar nova ficha
              </Link>
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Motoristas cadastrados" value={d.totals.drivers} icon={UserRound} href="/motoristas" />
        <Stat label="Veículos cadastrados" value={d.totals.vehicles} icon={Truck} href="/veiculos" />
        <Stat label="Fichas recentes" value={d.recent} icon={Sparkles} hint="Criadas nos últimos 7 dias" tone="sun" />
        <Stat label="Cadastros incompletos" value={d.incompletos} icon={ClipboardList} hint={split("incompleto", "aguardando_conferencia")} tone="orange" />
        <Stat label="Documentos pendentes" value={d.pendentes} icon={FileWarning} hint={split("documentacao_pendente", "vencido")} tone="red" />
        <Stat label="Próximos do vencimento" value={d.proximos} icon={CalendarClock} hint={`${split("proximo_vencimento")} · ${d.warningDays} dias`} tone="sun" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Atividades recentes</CardTitle>
              <CardDescription>Últimas fichas criadas ou atualizadas</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {d.activity.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nenhuma ficha ainda"
                description="Crie a primeira ficha enviando os documentos — a IA preenche os dados para você conferir."
                action={
                  canCreate && (
                    <Button asChild>
                      <Link href="/nova-ficha">
                        <Plus /> Criar nova ficha
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {d.activity.map((a) => {
                  const Icon = a.kind === "driver" ? UserRound : Truck;
                  const created = a.version <= 1 && a.createdAt.slice(0, 16) === a.updatedAt.slice(0, 16);
                  return (
                    <li key={`${a.kind}-${a.id}`}>
                      <Link href={`/${KIND_LABELS[a.kind].slug}/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas/70">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{a.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {created ? "Criada" : `Atualizada (v${a.version})`} {a.userName ? `por ${a.userName}` : ""} · {formatDateTimeBR(a.updatedAt)}
                          </span>
                        </span>
                        <StatusBadge status={a.status} className="hidden sm:inline-flex" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertOctagon className="size-4 text-sun-500" /> Vencimentos
            </CardTitle>
            <CardDescription>Documentos vencidos ou que vencem em até {d.warningDays} dias</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {d.expiring.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nada vencendo" description="Nenhum documento com validade próxima. Datas não informadas não entram no cálculo." className="py-10" />
            ) : (
              <ul className="divide-y divide-line">
                {d.expiring.map((e) => (
                  <li key={`${e.kind}-${e.id}-${e.key}`}>
                    <Link href={`/${KIND_LABELS[e.kind].slug}/${e.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{e.title}</span>
                        <span className="text-xs text-muted">
                          {e.label} · {formatDateBR(e.date)}
                        </span>
                      </span>
                      <ExpiryBadge e={e} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
