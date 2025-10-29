// lib/useBurnPrefs.ts
"use client";
import * as React from "react";
import { readBurnExclusions, readBurnExcludedCats } from "@/lib/burn-utils";

export function useBurnPrefs(
  spender: string,
  statementId: string | undefined,
  period: "CURRENT" | "YTD"
) {
  const [txSet, setTx] = React.useState<Set<string>>(new Set());
  const [catSet, setCats] = React.useState<Set<string>>(new Set());
  const [version, setVersion] = React.useState(0); // bump to refresh

  // initial load + whenever keys change
  React.useEffect(() => {
    if (!statementId) return;
    setTx(readBurnExclusions(spender, statementId, period));
    setCats(readBurnExcludedCats(spender, statementId, period));
  }, [spender, statementId, period, version]);

  // listen for cross-tab or dialog updates (storage events)
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key.includes("forevian.burnExclusions.v1") ||
        e.key.includes("forevian.burnExcludedCats.v1")
      ) {
        setVersion((v) => v + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { txSet, catSet, refresh: () => setVersion((v) => v + 1) };
}
