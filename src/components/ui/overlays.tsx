"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

// ------------------------------------------------------------------ Dialog
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, wide, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { wide?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-pop)] focus:outline-none",
          wide ? "max-w-4xl" : "max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Fechar">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-8 text-lg font-bold tracking-tight text-ink", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 text-sm text-muted", className)} {...props} />;
}

// ------------------------------------------------------------- AlertDialog
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  tone = "primary",
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => unknown;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-[2px]" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-pop)]">
          <AlertDialogPrimitive.Title className="text-lg font-bold tracking-tight">{title}</AlertDialogPrimitive.Title>
          {description && <AlertDialogPrimitive.Description className="mt-2 text-sm text-ink-soft">{description}</AlertDialogPrimitive.Description>}
          {children}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel className={buttonVariants({ variant: "secondary" })}>Cancelar</AlertDialogPrimitive.Cancel>
            <button
              type="button"
              className={buttonVariants({ variant: tone === "danger" ? "danger" : "primary" })}
              disabled={loading}
              onClick={async (e) => {
                e.preventDefault();
                await onConfirm();
              }}
            >
              {loading ? "Aguarde…" : confirmLabel}
            </button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------- Dropdown
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export function DropdownMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn("z-50 min-w-48 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]", className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4",
        danger ? "text-red-700 data-[highlighted]:bg-red-50" : "text-ink-soft data-[highlighted]:bg-brand-50 data-[highlighted]:text-ink",
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("px-2.5 py-1.5 text-xs font-semibold text-muted", className)} {...props} />;
}

// -------------------------------------------------------------------- Tabs
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-1 overflow-x-auto border-b border-line scrollbar-thin", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-ink",
        "data-[state=active]:border-sun-400 data-[state=active]:text-brand-800 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

// ----------------------------------------------------------------- Tooltip
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-72 rounded-lg bg-brand-950 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-lg">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ------------------------------------------------------------ Switch/Check
export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-600 disabled:opacity-50", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-slate-300 bg-white data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600 text-white", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
