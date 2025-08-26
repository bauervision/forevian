"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DEMO_MONTHS } from "@/app/demo/data";
import { NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";

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
  const search = useSearchParams();
  const { setTransactions, setInputs } = useReconcilerSelectors();

  // Run BEFORE children effects, so pages that call readIndex() see fresh data.
  React.useLayoutEffect(() => {
    if (!pathname?.startsWith("/demo")) return;

    // 1) Hard-write the entire demo index on every /demo mount.
    const idxMap = buildDemoIndex();
    localStorage.setItem(LS_IDX, JSON.stringify(idxMap));

    // 2) Choose selected id: ?statement -> env -> latest demo -> first
    const qp = search.get("statement") || undefined;
    const envId =
      (process.env.NEXT_PUBLIC_DEMO_MONTH as string | undefined) || undefined;
    const latest = DEMO_MONTHS.at(-1)?.id;
    const first = DEMO_MONTHS[0]?.id;
    const selectedId =
      (qp && idxMap[qp] ? qp : undefined) ??
      (envId && idxMap[envId] ? envId : undefined) ??
      latest ??
      first ??
      "";

    if (selectedId) {
      localStorage.setItem(LS_CUR, selectedId);
    }

    // 3) Push snapshot into provider + persist tx/inputs caches
    const snap = selectedId ? idxMap[selectedId] : undefined;
    if (snap && snap.cachedTx?.length) {
      setTransactions(snap.cachedTx as any);
      setInputs({
        beginningBalance: snap.inputs.beginningBalance ?? 0,
        totalDeposits: snap.inputs.totalDeposits ?? 0,
        totalWithdrawals: snap.inputs.totalWithdrawals ?? 0,
      });

      localStorage.setItem(LS_TX, JSON.stringify(snap.cachedTx));
      localStorage.setItem(
        LS_IN,
        JSON.stringify({
          beginningBalance: snap.inputs.beginningBalance ?? 0,
          totalDeposits: snap.inputs.totalDeposits ?? 0,
          totalWithdrawals: snap.inputs.totalWithdrawals ?? 0,
        })
      );
    }
  }, [pathname]); // only rerun when route changes

  return null;
}
