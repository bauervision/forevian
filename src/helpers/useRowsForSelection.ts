// helpers/useRowsForSelection.ts
"use client";

import { useMemo } from "react";
import type { Period } from "@/lib/period";
import type { TxRow } from "@/lib/types";
import { readIndex } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { normalizePageText } from "@/lib/textNormalizer";
import { rebuildFromPages } from "@/lib/import/reconcile";

export function useRowsForSelection(
  period: Period,
  selectedIdRaw: string | null,
  currentMonthRows: TxRow[]
): TxRow[] {
  const selectedId = selectedIdRaw ?? "";

  return useMemo(() => {
    if (!selectedId) return [];

    if (period === "CURRENT") {
      // Whatever the provider currently holds for the selected month
      return currentMonthRows || [];
    }

    // YTD: gather from Jan..selected month of the same year
    const idx = readIndex();
    const sel = idx[selectedId];
    if (!sel) return [];

    const rules = readCatRules();
    const all: TxRow[] = [];

    for (let m = 1; m <= sel.stmtMonth; m++) {
      const id =
        String(sel.stmtYear).padStart(4, "0") +
        "-" +
        String(m).padStart(2, "0");
      const s = idx[id];
      if (!s) continue;

      let rows: TxRow[] = [];
      if (Array.isArray(s.cachedTx) && s.cachedTx.length) {
        rows = applyCategoryRulesTo(rules, s.cachedTx, applyAlias) as TxRow[];
      } else if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
        const pages = s.pagesRaw.map(normalizePageText);
        const res = rebuildFromPages(pages, s.stmtYear, applyAlias);
        rows = applyCategoryRulesTo(rules, res.txs, applyAlias) as TxRow[];
      }
      all.push(...rows);
    }

    return all;
  }, [period, selectedId, currentMonthRows]);
}
