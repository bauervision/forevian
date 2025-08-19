// helpers/useRowsForSelection.ts (or inline in each page)
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
  return React.useMemo(() => {
    const idx = readIndex();
    const selected = idx[selectedId];
    if (!selected) return liveRows;

    // CURRENT = only the chosen statement
    if (period === "CURRENT") {
      if (selectedId === readCurrentId()) return liveRows; // currently edited month
      return Array.isArray(selected.cachedTx) ? selected.cachedTx : [];
    }

    // YTD = Jan..selected.month of selected.year
    const rules = readCatRules();
    const all: any[] = [];
    for (const s of Object.values(idx)) {
      if (!s) continue;
      if (s.stmtYear !== selected.stmtYear) continue;
      if (s.stmtMonth > selected.stmtMonth) continue;
      if (Array.isArray(s.cachedTx)) all.push(...s.cachedTx);
      else if (selectedId === readCurrentId() && s.id === selectedId)
        all.push(...liveRows);
    }
    return applyCategoryRulesTo(rules, all, applyAlias) as typeof liveRows;
  }, [period, selectedId, liveRows]);
}
