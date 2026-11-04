import { AlertTriangle, CalendarClock, CalendarX2 } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { formatDateBR } from "@/lib/format";
import { STATUS_INFO, type ExpiryInfo, type RecordStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-500">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status, className }: { status: RecordStatus; className?: string }) {
  const info = STATUS_INFO[status];
  return (
    <Badge tone={info.tone} dot className={className} title={info.description}>
      {info.label}
    </Badge>
  );
}

export function ExpiryBadge({ e }: { e: ExpiryInfo }) {
  if (e.state === "ok") return null;
  const Icon = e.state === "vencido" ? CalendarX2 : CalendarClock;
  return (
    <Badge tone={e.state === "vencido" ? "red" : "yellow"}>
      <Icon className="size-3.5" />
      {e.label} {e.state === "vencido" ? `vencida em ${formatDateBR(e.date)}` : `vence em ${e.daysLeft} dia${e.daysLeft === 1 ? "" : "s"}`}
    </Badge>
  );
}

export function EmptyState({
  icon: Icon = AlertTriangle,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-sun-300" />
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100">
          <Icon className="size-6" />
        </div>
      </div>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12.5px] tracking-tight text-ink-soft", className)}>{children}</span>;
}
