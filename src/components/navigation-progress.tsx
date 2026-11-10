"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Barra fina no topo durante a troca de página. Só aparece se a navegação
 * passar de ~120 ms (evita piscar em navegações instantâneas) e substitui o
 * esqueleto de carregamento, que obrigava o React a esperar ao menos 300 ms.
 */
function Progress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [visible, setVisible] = useState(false);
  const timers = useRef<{ show?: ReturnType<typeof setTimeout>; safety?: ReturnType<typeof setTimeout> }>({});

  const stop = () => {
    clearTimeout(timers.current.show);
    clearTimeout(timers.current.safety);
    setVisible(false);
  };

  // A navegação terminou quando a URL renderizada muda
  useEffect(stop, [pathname, params]);

  useEffect(() => {
    const start = () => {
      clearTimeout(timers.current.show);
      clearTimeout(timers.current.safety);
      timers.current.show = setTimeout(() => setVisible(true), 120);
      timers.current.safety = setTimeout(() => setVisible(false), 15000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", start);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-sun-100" role="progressbar" aria-label="Carregando página">
      <div className="af-indeterminate h-full w-1/3 rounded-full bg-sun-400" />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
