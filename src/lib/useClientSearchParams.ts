// lib/useClientSearchParams.ts
"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { readCurrentId, writeCurrentId } from "@/lib/statements";

/** Read a single query param on the client. Safe for static/SSG. */
export function useClientSearchParam(name: string): string | null {
  const pathname = usePathname();
  const [val, setVal] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setVal(sp.get(name));
    } catch {
      setVal(null);
    }
  }, [name, pathname]); // re-evaluate when the route changes

  return val;
}

const LS_CUR = "reconciler.statements.current.v2";

/** Canonical way to know which statement is in play (query OR localStorage). */
export function useSelectedStatementId(): string | null {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;
  const [id, setId] = React.useState<string | null>(null);

  const readNow = React.useMemo(
    () => () => {
      if (typeof window === "undefined") return null;
      const urlId = new URL(window.location.href).searchParams.get("statement");
      if (!isDemo && urlId) return urlId; // URL wins (non-demo)
      return localStorage.getItem(LS_CUR); // fallback to LS
    },
    [isDemo]
  );

  React.useEffect(() => {
    const update = () => setId(readNow());
    update(); // initial
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_CUR) update();
    };
    const onCustom = () => update();
    const onPop = () => update();

    window.addEventListener("storage", onStorage);
    window.addEventListener("popstate", onPop);
    window.addEventListener("forevian:statement-change", onCustom as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("forevian:statement-change", onCustom as any);
    };
  }, [readNow]);

  return id;
}
