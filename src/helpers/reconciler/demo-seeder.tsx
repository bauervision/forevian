// app/helpers/reconciler/demo-seeder.tsx
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { DEMO_MONTHS, DEMO_VERSION } from "@/app/demo/data";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { withCanonicalCategories } from "./reconciler-canon"; // your extracted helper

/**
 * LocalStorage keys used by the *real* app.
 * We temporarily swap these to demo content only while on /demo routes.
 */
const LS_IDX = "reconciler.statements.index.v2";
const LS_CUR = "reconciler.statements.current.v2";
const LS_TX = "reconciler.tx.v1";
const LS_IN = "reconciler.inputs.v1";

/** Demo-only hash key (separate from any real keys) */
const LS_DEMO_HASH = "reconciler.demoPayloadHash.v1";

/** Backup keys to preserve real data while /demo is active */
const BK_IDX = "backup.real.reconciler.statements.index.v2";
const BK_CUR = "backup.real.reconciler.statements.current.v2";
const BK_TX = "backup.real.reconciler.tx.v1";
const BK_IN = "backup.real.reconciler.inputs.v1";

/** Utility: safe localStorage get/set */
function lsGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}
function lsDel(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

/** Build a consistent demo-hash so we can re-seed only when the demo payload changes. */
function payloadHash(): string {
  const s = JSON.stringify(DEMO_MONTHS);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `v${DEMO_VERSION}:${h}`;
}

/** Construct an index map in the real app’s expected shape */
function buildDemoIndex() {
  const map: Record<
    string,
    {
      id: string;
      label: string;
      stmtYear: number;
      stmtMonth: number;
      inputs: {
        beginningBalance?: number;
        totalDeposits?: number;
        totalWithdrawals?: number;
      };
      cachedTx: any[];
    }
  > = {};
  for (const m of DEMO_MONTHS) {
    map[m.id] = {
      id: m.id,
      label: m.label,
      stmtYear: m.stmtYear,
      stmtMonth: m.stmtMonth,
      inputs: {
        beginningBalance: m.inputs?.beginningBalance ?? 0,
        totalDeposits: m.inputs?.totalDeposits ?? 0,
        totalWithdrawals: m.inputs?.totalWithdrawals ?? 0,
      },
      cachedTx: Array.isArray(m.cachedTx) ? m.cachedTx : [],
    };
  }
  return map;
}

/**
 * DemoSeeder
 * - Mount on /demo: backup real keys → write demo payload into live keys → push to providers.
 * - Unmount (leaving /demo): restore backups → clean backups.
 */
export default function DemoSeeder() {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  const { setTransactions, setInputs } = useReconcilerSelectors();

  React.useLayoutEffect(() => {
    if (!isDemo) return; // absolute guard: do nothing outside /demo

    // If we already swapped once and backups exist, don’t double-backup.
    const alreadyBackedUp =
      lsGet(BK_IDX) !== null ||
      lsGet(BK_CUR) !== null ||
      lsGet(BK_TX) !== null ||
      lsGet(BK_IN) !== null;

    // 1) Backup real keys (first time only this session)
    if (!alreadyBackedUp) {
      const realIdx = lsGet(LS_IDX);
      const realCur = lsGet(LS_CUR);
      const realTx = lsGet(LS_TX);
      const realIn = lsGet(LS_IN);
      if (realIdx !== null) lsSet(BK_IDX, realIdx);
      if (realCur !== null) lsSet(BK_CUR, realCur);
      if (realTx !== null) lsSet(BK_TX, realTx);
      if (realIn !== null) lsSet(BK_IN, realIn);
    }

    // 2) Seed demo into the live keys if needed
    const currentHash = payloadHash();
    const storedHash = lsGet(LS_DEMO_HASH);
    const needSeed = storedHash !== currentHash || !lsGet(LS_IDX);

    if (needSeed) {
      const idx = buildDemoIndex();
      lsSet(LS_IDX, JSON.stringify(idx));

      // choose latest month (or first) for demo
      const latest = DEMO_MONTHS.at(-1)?.id ?? DEMO_MONTHS[0]?.id ?? "";
      if (latest) {
        lsSet(LS_CUR, latest);
        const s = idx[latest];

        // Apply rules & canon, then push to provider state
        const rules = readCatRules();
        const withRules = applyCategoryRulesTo(
          rules,
          s.cachedTx || [],
          applyAlias
        );
        const normalized = withCanonicalCategories(withRules, { isDemo: true });

        setTransactions(normalized);
        setInputs({
          beginningBalance: s.inputs.beginningBalance ?? 0,
          totalDeposits: s.inputs.totalDeposits ?? 0,
          totalWithdrawals: s.inputs.totalWithdrawals ?? 0,
        });

        // Persist raw demo tx & inputs for refreshes (still in *live* keys)
        lsSet(LS_TX, JSON.stringify(s.cachedTx || []));
        lsSet(
          LS_IN,
          JSON.stringify({
            beginningBalance: s.inputs.beginningBalance ?? 0,
            totalDeposits: s.inputs.totalDeposits ?? 0,
            totalWithdrawals: s.inputs.totalWithdrawals ?? 0,
          })
        );
      }

      lsSet(LS_DEMO_HASH, currentHash);
    } else {
      // Rehydrate from existing live demo state
      try {
        const rawTx = JSON.parse(lsGet(LS_TX) || "[]");
        const rules = readCatRules();
        const withRules = applyCategoryRulesTo(
          rules,
          Array.isArray(rawTx) ? rawTx : [],
          applyAlias
        );
        const normalized = withCanonicalCategories(withRules, { isDemo: true });
        setTransactions(normalized);

        const ins = JSON.parse(lsGet(LS_IN) || "{}");
        if (ins && typeof ins === "object") {
          setInputs({
            beginningBalance: ins.beginningBalance ?? 0,
            totalDeposits: ins.totalDeposits ?? 0,
            totalWithdrawals: ins.totalWithdrawals ?? 0,
          });
        }
      } catch {
        // ignore parse errors; user can refresh demo
      }
    }

    // 3) On unmount (leaving /demo): restore backups → clear backups
    return () => {
      const bIdx = lsGet(BK_IDX);
      const bCur = lsGet(BK_CUR);
      const bTx = lsGet(BK_TX);
      const bIn = lsGet(BK_IN);

      // Restore originals (including nulls to remove keys that didn’t exist)
      if (bIdx !== null) lsSet(LS_IDX, bIdx);
      else lsDel(LS_IDX);
      if (bCur !== null) lsSet(LS_CUR, bCur);
      else lsDel(LS_CUR);
      if (bTx !== null) lsSet(LS_TX, bTx);
      else lsDel(LS_TX);
      if (bIn !== null) lsSet(LS_IN, bIn);
      else lsDel(LS_IN);

      // Clean backups
      lsDel(BK_IDX);
      lsDel(BK_CUR);
      lsDel(BK_TX);
      lsDel(BK_IN);
      // Do NOT clear LS_DEMO_HASH; it’s demo-only and harmless outside demo.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  return null;
}
