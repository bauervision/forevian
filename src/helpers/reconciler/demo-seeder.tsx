// lib/reconciler/demo-seeder.tsx
"use client";

import * as React from "react";
import { ensureCategoryRulesSeededOnce } from "@/lib/categoryRules/seed";
import { upsertCategoryRules, readCatRules } from "@/lib/categoryRules";
import {
  readIndex,
  upsertStatement,
  emptyStatement,
  type StatementSnapshot,
} from "@/lib/statements";
import { applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { withCanonicalCategories } from "./reconciler-canon";
import { DEMO_MONTHS, DEMO_VERSION } from "@/app/demo/data";
import { useClientSearchParam } from "@/lib/useClientSearchParams";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";

const LS_IDX = "reconciler.statements.index.v2";
const LS_CUR = "reconciler.statements.current.v2";
const LS_TX = "reconciler.tx.v1";
const LS_IN = "reconciler.inputs.v1";
const LS_DEMO_HASH = "reconciler.demoPayloadHash.v1";

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
  cachedTx: any[];
};

function buildDemoIndex(): Record<string, Snap> {
  const map: Record<string, Snap> = {};
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

function payloadHash(): string {
  const s = JSON.stringify(DEMO_MONTHS);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `v${DEMO_VERSION}:${h}`;
}

/** Demo seeding/restore. Mount this ONLY on /demo routes. */
export function DemoSeeder() {
  const { setTransactions, setInputs } = useReconcilerSelectors();
  const qp = useClientSearchParam("statement") || undefined;

  React.useLayoutEffect(() => {
    // Seed canonical default rules used by the demo
    ensureCategoryRulesSeededOnce();
    // Example: pre-warm Starbucks token rule
    upsertCategoryRules(["tok:starbucks", "tok:sbux"], "Dining", "token");

    const current = payloadHash();
    const stored = localStorage.getItem(LS_DEMO_HASH);
    const needSeed =
      stored !== current ||
      !localStorage.getItem(LS_IDX) ||
      !localStorage.getItem(LS_CUR) ||
      !localStorage.getItem(LS_TX) ||
      !localStorage.getItem(LS_IN);

    if (needSeed) {
      const idx = buildDemoIndex();
      localStorage.setItem(LS_IDX, JSON.stringify(idx));

      const envId =
        (process.env.NEXT_PUBLIC_DEMO_MONTH as string | undefined) || undefined;
      const latest = DEMO_MONTHS.at(-1)?.id;
      const first = DEMO_MONTHS[0]?.id;
      const sel =
        (qp && idx[qp] ? qp : undefined) ??
        (envId && idx[envId] ? envId : undefined) ??
        latest ??
        first ??
        "";

      if (sel) {
        localStorage.setItem(LS_CUR, sel);
        const s = idx[sel];

        const rules = readCatRules();
        const raw = Array.isArray(s.cachedTx) ? s.cachedTx : [];
        const withRules = applyCategoryRulesTo(rules, raw, applyAlias);
        const normalized = withCanonicalCategories(withRules, { isDemo: true });

        setTransactions(normalized);
        try {
          localStorage.setItem(LS_TX, JSON.stringify(normalized));
        } catch {}

        const inputs = {
          beginningBalance: s.inputs.beginningBalance ?? 0,
          totalDeposits: s.inputs.totalDeposits ?? 0,
          totalWithdrawals: s.inputs.totalWithdrawals ?? 0,
        };
        setInputs(inputs);
        localStorage.setItem(LS_IN, JSON.stringify(inputs));

        // Also mirror the statements store so non-demo code that calls readIndex() works.
        for (const m of DEMO_MONTHS) {
          upsertStatement({
            ...emptyStatement(m.id, m.label, m.stmtYear, m.stmtMonth),
            inputs: m.inputs,
            cachedTx: m.cachedTx,
            normalizerVersion: 0,
          } as StatementSnapshot);
        }
      }

      localStorage.setItem(LS_DEMO_HASH, current);
    } else {
      // Restore from LS
      try {
        const tx = JSON.parse(localStorage.getItem(LS_TX) || "[]");
        const normalized = Array.isArray(tx)
          ? withCanonicalCategories(tx, { isDemo: true })
          : [];
        setTransactions(normalized);

        const inputs = JSON.parse(localStorage.getItem(LS_IN) || "{}");
        if (inputs && typeof inputs === "object") setInputs(inputs);
      } catch {}
    }
  }, [qp, setInputs, setTransactions]);

  return null;
}
