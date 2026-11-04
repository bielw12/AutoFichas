import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 transition-colors",
      "hover:border-brand-200 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-3 focus-visible:ring-brand-100",
      "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted read-only:bg-canvas/60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70",
      "hover:border-brand-200 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-3 focus-visible:ring-brand-100",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full appearance-none rounded-lg border border-line bg-white pl-3 pr-9 text-sm text-ink",
      "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2366728a%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_0.65rem_center] bg-no-repeat",
      "hover:border-brand-200 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-3 focus-visible:ring-brand-100 disabled:bg-canvas",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export const Label = React.forwardRef<React.ComponentRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn("text-[13px] font-semibold text-ink-soft", className)} {...props} />,
);
Label.displayName = "Label";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-bold tracking-tight text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative overflow-hidden rounded-md bg-line/60 before:absolute before:inset-0 before:-translate-x-full before:animate-[af-shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent", className)} {...props} />;
}

const TONES = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  yellow: "bg-sun-50 text-sun-600 ring-sun-500/30",
  orange: "bg-orange-50 text-orange-800 ring-orange-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", className, children, dot, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap", TONES[tone], className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}
