import { cn } from "@/lib/utils";

/** Marca do produto: ficha com faixa amarela e "check" de conferência. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect x="2" y="2" width="36" height="36" rx="10" fill="#f4c91c" />
      <path d="M12 9.5h12.5l5 5V30a1.5 1.5 0 0 1-1.5 1.5H12A1.5 1.5 0 0 1 10.5 30V11A1.5 1.5 0 0 1 12 9.5Z" fill="#10253f" />
      <path d="M24.5 9.5v5h5" fill="#2d63a6" />
      <rect x="14" y="16" width="8" height="2.2" rx="1.1" fill="#f4c91c" />
      <rect x="14" y="20.5" width="12" height="1.6" rx=".8" fill="#82a9d7" />
      <path d="m15 26.2 2.4 2.3 4.6-4.8" stroke="#f4c91c" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-none">
        <div className={cn("text-[17px] font-extrabold tracking-tight", inverted ? "text-white" : "text-brand-900")}>
          Auto<span className={inverted ? "text-sun-300" : "text-brand-500"}>Fichas</span>
        </div>
        <div className={cn("mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]", inverted ? "text-brand-300" : "text-muted")}>Cadastro inteligente</div>
      </div>
    </div>
  );
}
