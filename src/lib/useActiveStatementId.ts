// lib/useActiveStatementId.ts
"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readIndex, readCurrentId } from "@/lib/statements";
import { useSelectedStatementId } from "@/lib/useClientSearchParams";

export function useActiveStatementId() {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;
  const selectedId = useSelectedStatementId(); // URL (non-demo) or LS (demo)
  const [id, setId] = useState<string>("");

  useEffect(() => {
    const idx = readIndex();
    const list = Object.values(idx).sort(
      (a: any, b: any) => b.stmtYear - a.stmtYear || b.stmtMonth - a.stmtMonth
    );
    const latestWithData = list.find(
      (s) => (s?.cachedTx?.length || 0) > 0 || (s?.pagesRaw?.length || 0) > 0
    );
    const saved = readCurrentId();
    const next = (
      selectedId ||
      saved ||
      latestWithData?.id ||
      list[0]?.id ||
      ""
    ).trim();
    setId(next);
  }, [selectedId, isDemo]);

  return id;
}
