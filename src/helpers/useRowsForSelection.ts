// helpers/useRowsForSelection.ts
import { readIndex, readCurrentId } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import type { Period } from "@/lib/period";
import React from "react";

export function useRowsForSelection(
  period: Period,
  selectedId: string,
  liveRows: any[]
) {
  // 🔁 Recompute if storage changes (demo reseed, statement switch in another tab)
  const [storageBump, setStorageBump] = React.useState(0);
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "reconciler.statements.index.v2" ||
        e.key === "reconciler.statements.current.v2"
      ) {
        setStorageBump((x) => x + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return React.useMemo(() => {
    const idx = readIndex();
    const selected = idx[selectedId];
    if (!selected) return liveRows;

    // CURRENT = only the chosen statement
    if (period === "CURRENT") {
      const currentId = readCurrentId();
      // If we’re looking at the "current" statement, prefer liveRows,
      // but fall back to cachedTx when liveRows are empty (e.g., on dashboard/category pages).
      if (selectedId === currentId) {
        if (Array.isArray(liveRows) && liveRows.length > 0) return liveRows;
        return Array.isArray(selected.cachedTx) ? selected.cachedTx : [];
      }
      // Viewing a non-current statement → use its cached snapshot
      return Array.isArray(selected.cachedTx) ? selected.cachedTx : [];
    }

    // YTD = Jan..selected.month of selected.year
    const rules = readCatRules();
    const all: any[] = [];
    for (const s of Object.values(idx)) {
      if (!s) continue;
      if (s.stmtYear !== selected.stmtYear) continue;
      if (s.stmtMonth > selected.stmtMonth) continue;
      if (Array.isArray(s.cachedTx)) {
        all.push(...s.cachedTx);
      } else if (selectedId === readCurrentId() && s.id === selectedId) {
        all.push(...liveRows);
      }
    }
    return applyCategoryRulesTo(rules, all, applyAlias) as typeof liveRows;
  }, [period, selectedId, liveRows, storageBump]);
}
