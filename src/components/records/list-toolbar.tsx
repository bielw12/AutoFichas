"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/primitives";
import { STATUS_FILTERS, STATUS_INFO } from "@/lib/status";

export function ListToolbar({ placeholder, exportHref, canExportFull }: { placeholder: string; exportHref: string; canExportFull: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const t = setTimeout(() => {
      // Não reescreve a URL se o usuário já navegou para outra página
      if (window.location.pathname !== pathname) return;
      if ((params.get("q") ?? "") !== q) update({ q: q.trim() || null });
    }, 350);
    // Clique em um link (ex.: abrir uma ficha) cancela a pesquisa pendente
    const cancel = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("a[href]")) clearTimeout(t);
    };
    document.addEventListener("click", cancel, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", cancel, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = new URLSearchParams();
  for (const k of ["q", "status", "sort"]) if (params.get(k)) query.set(k, params.get(k)!);

  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9 pr-9" aria-label="Pesquisar" />
        {pending ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : q ? (
          <button className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink" onClick={() => setQ("")} aria-label="Limpar pesquisa">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <NativeSelect className="w-auto min-w-48" value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_INFO[s].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="w-auto min-w-52" value={params.get("sort") ?? "updated_desc"} onChange={(e) => update({ sort: e.target.value === "updated_desc" ? null : e.target.value })} aria-label="Ordenar">
          <option value="updated_desc">Atualizados recentemente</option>
          <option value="updated_asc">Atualizados há mais tempo</option>
          <option value="created_desc">Criados recentemente</option>
          <option value="created_asc">Criados há mais tempo</option>
          <option value="name_asc">Nome (A–Z)</option>
        </NativeSelect>
        <Button variant="secondary" asChild>
          <a href={`${exportHref}?${query.toString()}`}>
            <Download /> CSV
          </a>
        </Button>
        {canExportFull && (
          <Button variant="ghost" asChild title="Exporta CPF/CNPJ completos. Uso restrito.">
            <a href={`${exportHref}?${query.toString()}${query.toString() ? "&" : ""}full=1`}>CSV completo</a>
          </Button>
        )}
      </div>
    </div>
  );
}
