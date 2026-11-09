"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsUpDown, MonitorSmartphone, FilePlus2, KeyRound, LayoutDashboard, LogOut, Menu, Settings, Trash2, Truck, UserRound, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Wordmark } from "@/components/logo-mark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, TooltipProvider } from "@/components/ui/overlays";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
  adminOnly?: boolean;
  hideFor?: Role[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
  { href: "/nova-ficha", label: "Nova ficha cadastral", icon: FilePlus2, match: (p) => p.startsWith("/nova-ficha"), hideFor: ["visualizador"] },
  { href: "/motoristas", label: "Fichas de motoristas", icon: UserRound, match: (p) => p.startsWith("/motoristas") },
  { href: "/veiculos", label: "Fichas de veículos", icon: Truck, match: (p) => p.startsWith("/veiculos") },
  { href: "/configuracoes", label: "Configurações", icon: Settings, match: (p) => p.startsWith("/configuracoes") },
  { href: "/lixeira", label: "Lixeira", icon: Trash2, match: (p) => p.startsWith("/lixeira"), adminOnly: true },
];

export function AppShell({
  user,
  company,
  authDisabled = false,
  children,
}: {
  user: { name: string; email: string; role: Role; mustChangePassword: boolean };
  company: { name: string; configured: boolean; logoUrl: string | null };
  authDisabled?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const items = NAV.filter((i) => (!i.adminOnly || user.role === "admin") && !i.hideFor?.includes(user.role));
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-6 pt-6">
        <Link href="/" aria-label="Início">
          <Wordmark inverted />
        </Link>
        <button className="rounded-md p-1.5 text-brand-200 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
          <X className="size-5" />
        </button>
      </div>
      {(company.name || company.logoUrl) && (
        <Link href="/configuracoes" className="mx-4 mb-4 block rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10" title="Logotipo e informações padrão">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt={company.name || "Logotipo da transportadora"} className="mb-1.5 max-h-12 max-w-full object-contain" />
          )}
          {company.name && (
            <>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-300">Transportadora</div>
              <div className="truncate text-sm font-semibold text-white">{company.name}</div>
            </>
          )}
        </Link>
      )}
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Navegação principal">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors",
                active ? "bg-white/10 text-white" : "text-brand-200 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className={cn("absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sun-400 transition-opacity", active ? "opacity-100" : "opacity-0")} />
              <Icon className={cn("size-[18px]", active ? "text-sun-300" : "text-brand-300 group-hover:text-brand-100")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        {authDisabled ? (
          <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5" title="AUTH_DISABLED=true — use apenas em ambiente local">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sun-400 text-brand-950">
              <MonitorSmartphone className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">Modo local</span>
              <span className="block truncate text-xs text-brand-300">Login desativado</span>
            </span>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/5 focus-visible:outline-sun-300">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sun-400 text-sm font-extrabold text-brand-950">{initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
                <span className="block truncate text-xs text-brand-300">{ROLE_LABELS[user.role].label}</span>
              </span>
              <ChevronsUpDown className="size-4 text-brand-300" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/configuracoes?tab=conta">
                  <KeyRound /> Alterar senha
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void logoutAction()}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="min-h-dvh lg:pl-[264px]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] bg-brand-900 lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-brand-950/50" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[280px] bg-brand-900 shadow-xl">{sidebar}</aside>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <button className="rounded-md p-1.5 text-ink-soft hover:bg-canvas" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <Wordmark className="[&_div:last-child>div:last-child]:hidden" />
        </header>
        {user.mustChangePassword && !authDisabled && (
          <div className="border-b border-sun-200 bg-sun-50 px-4 py-2.5 text-sm text-ink-soft sm:px-8">
            Você está usando uma senha temporária.{" "}
            <Link className="font-semibold text-brand-700 underline" href="/configuracoes?tab=conta">
              Defina uma nova senha
            </Link>
            .
          </div>
        )}
        {!company.configured && user.role === "admin" && (
          <div className="border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-ink-soft sm:px-8">
            Cadastre o logotipo e as informações padrão da transportadora — eles aparecem no rodapé de todas as fichas.{" "}
            <Link className="font-semibold text-brand-700 underline" href="/configuracoes">
              Ir para configurações
            </Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </TooltipProvider>
  );
}
