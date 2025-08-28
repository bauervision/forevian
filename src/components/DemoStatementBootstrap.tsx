"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { DEMO_MONTHS } from "@/app/demo/data";
import { NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { readCurrentId, readIndex } from "@/lib/statements";
import { applyCategoryRulesTo, readCatRules } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { useSelectedStatementId } from "@/lib/useClientSearchParams";

type Snap = {
  id: string;
  label: string;
  stmtYear: number;
  stmtMonth: number;
  inputs: {
    beginningBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
  cachedTx: Array<any>;
  pagesRaw: any[];
  normalizerVersion: number;
};

const LS_IDX = "reconciler.statements.index.v2";
const LS_CUR = "reconciler.statements.current.v2";
const LS_TX = "reconciler.tx.v1";
const LS_IN = "reconciler.inputs.v1";

/** Build a clean index map from DEMO_MONTHS */
function buildDemoIndex(): Record<string, Snap> {
  const m: Record<string, Snap> = {};
  for (const s of DEMO_MONTHS) {
    m[s.id] = {
      id: s.id,
      label: s.label,
      stmtYear: s.stmtYear,
      stmtMonth: s.stmtMonth,
      inputs: {
        beginningBalance: s.inputs?.beginningBalance ?? 0,
        totalDeposits: s.inputs?.totalDeposits ?? 0,
        totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
      },
      cachedTx: Array.isArray(s.cachedTx) ? s.cachedTx : [],
      pagesRaw: [], // no source pages in demo
      normalizerVersion: NORMALIZER_VERSION, // mark as final
    };
  }
  return m;
}

export default function DemoStatementsBootstrap() {
  const pathname = usePathname();

  const isDemo = pathname?.startsWith("/demo") ?? false;
  const { setTransactions } = useReconcilerSelectors();
  const sid = useSelectedStatementId();

  const hydrate = React.useCallback(() => {
    if (!isDemo) return;

    const idx = readIndex();
    const s = sid ? idx[sid] : undefined;
    const raw = Array.isArray(s?.cachedTx) ? s!.cachedTx : [];
    const rules = readCatRules();
    const withRules = applyCategoryRulesTo(rules, raw, applyAlias);
    setTransactions(withRules);
    try {
      localStorage.setItem(LS_TX, JSON.stringify(withRules));
    } catch {}
  }, [isDemo, setTransactions]);

  // on mount & whenever the URL statement changes
  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  // keep in sync if rules/overrides/statement change in another tab or locally
  React.useEffect(() => {
    if (!isDemo) return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === "categoryRules.v1" ||
        e.key === "overrides.v1" ||
        e.key === "reconciler.statements.current.v2"
      ) {
        hydrate();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isDemo, hydrate]);

  return null;
}
