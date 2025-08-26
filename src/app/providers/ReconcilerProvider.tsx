"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { getDemoSeed, DEMO_VERSION } from "@/app/demo/data";
import { writeCurrentId } from "@/lib/statements";

export type ReconcilerInputs = {
  beginningBalance?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
};

export type Transaction = {
  running?: number;
  id: string;
  date: string; // MM/DD
  description: string;
  amount: number; // + deposit, - withdrawal
  raw?: string;
  notes?: string;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
  parseWarnings?: string[];
};

type SetInputs =
  | ReconcilerInputs
  | ((prev: ReconcilerInputs) => ReconcilerInputs);
type SetTransactions = Transaction[] | ((prev: Transaction[]) => Transaction[]);

type ReconcilerCtx = {
  transactions: Transaction[];
  setTransactions: (rows: SetTransactions) => void;
  inputs: ReconcilerInputs;
  setInputs: (i: SetInputs) => void;
  clearAll: () => void;
};

const Ctx = createContext<ReconcilerCtx | null>(null);

const LS_TX = "reconciler.tx.v1";
const LS_IN = "reconciler.inputs.v1";
const LS_DEMO_VER = "reconciler.demoVersion.v1";
const LS_DEMO_SIG = "reconciler.demoSignature.v1";
const SS_DEMO_SEEDED = "reconciler.demoSeeded.v1";

/* ---------------- helpers ---------------- */

function shallowEqualInputs(a: ReconcilerInputs, b: ReconcilerInputs) {
  const an = {
    bb: a.beginningBalance ?? 0,
    td: a.totalDeposits ?? 0,
    tw: a.totalWithdrawals ?? 0,
  };
  const bn = {
    bb: b.beginningBalance ?? 0,
    td: b.totalDeposits ?? 0,
    tw: b.totalWithdrawals ?? 0,
  };
  return an.bb === bn.bb && an.td === bn.td && an.tw === bn.tw;
}

/** Compute a lightweight, stable signature from the *current* demo payload. */
function computeDemoSignature(): string {
  try {
    const monthId =
      typeof process !== "undefined"
        ? (process.env.NEXT_PUBLIC_DEMO_MONTH as string | undefined)
        : undefined;
    const { transactions, inputs } = getDemoSeed(monthId);
    const firstId = transactions[0]?.id || "";
    const lastId = transactions[transactions.length - 1]?.id || "";
    const sum = Math.round(
      transactions.reduce((s, t) => s + Number(t.amount || 0), 0) * 100
    );
    const inSig = [
      inputs.beginningBalance ?? 0,
      inputs.totalDeposits ?? 0,
      inputs.totalWithdrawals ?? 0,
    ]
      .map((n) => Math.round(Number(n) * 100))
      .join(":");
    return `${DEMO_VERSION}|${transactions.length}|${firstId}|${lastId}|${sum}|${inSig}`;
  } catch {
    return `ERR|${DEMO_VERSION}`;
  }
}

/** True if we’re on a /demo route; robust against hydration timing. */
function onDemoRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.location.pathname.startsWith("/demo");
  } catch {
    return false;
  }
}

/* ---------------- provider ---------------- */

export function ReconcilerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transactions, _setTransactions] = useState<Transaction[]>([]);
  const [inputs, _setInputs] = useState<ReconcilerInputs>({
    beginningBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
  });

  // DEMO-aware hydrate with version + signature guard and strong fallbacks
  useEffect(() => {
    const seedFromCurrentDemo = () => {
      const monthId =
        typeof process !== "undefined"
          ? (process.env.NEXT_PUBLIC_DEMO_MONTH as string | undefined)
          : undefined;
      const {
        id: seedId,
        transactions: seedTx,
        inputs: seedInputs,
      } = getDemoSeed(monthId);

      _setTransactions(seedTx);
      _setInputs(seedInputs);

      try {
        localStorage.setItem(LS_TX, JSON.stringify(seedTx));
        localStorage.setItem(LS_IN, JSON.stringify(seedInputs));
        localStorage.setItem(LS_DEMO_VER, String(DEMO_VERSION));
        localStorage.setItem(LS_DEMO_SIG, computeDemoSignature());
        sessionStorage.setItem(SS_DEMO_SEEDED, "1");

        writeCurrentId(seedId); // ✅ ensure a non-empty selection
      } catch {}
    };

    const hydrateFromLocal = () => {
      try {
        const rawTx = localStorage.getItem(LS_TX);
        if (rawTx) {
          const parsed = JSON.parse(rawTx);
          if (Array.isArray(parsed)) _setTransactions(parsed as Transaction[]);
        }
      } catch {}
      try {
        const rawIn = localStorage.getItem(LS_IN);
        if (rawIn) {
          const parsed = JSON.parse(rawIn);
          if (parsed && typeof parsed === "object")
            _setInputs(parsed as ReconcilerInputs);
        }
      } catch {}
    };

    const isDemo = onDemoRoute();

    if (isDemo) {
      // Read existing LS state
      const lsTx = (() => {
        try {
          return localStorage.getItem(LS_TX);
        } catch {
          return null;
        }
      })();
      const lsIn = (() => {
        try {
          return localStorage.getItem(LS_IN);
        } catch {
          return null;
        }
      })();
      const storedVer = (() => {
        try {
          return localStorage.getItem(LS_DEMO_VER);
        } catch {
          return null;
        }
      })();
      const storedSig = (() => {
        try {
          return localStorage.getItem(LS_DEMO_SIG);
        } catch {
          return null;
        }
      })();

      const currentSig = computeDemoSignature();
      const versionChanged = storedVer !== String(DEMO_VERSION);
      const signatureChanged = storedSig !== currentSig;
      const missingData = !lsTx || !lsIn; // brand-new or cleared storage

      // Seed if anything differs or data is missing
      if (versionChanged || signatureChanged || missingData) {
        seedFromCurrentDemo();
      } else {
        hydrateFromLocal();
      }

      // Mark session as seeded (prevents any other “first visit” paths from racing)
      try {
        sessionStorage.setItem(SS_DEMO_SEEDED, "1");
      } catch {}

      return;
    }

    // Non-demo: just hydrate
    hydrateFromLocal();
  }, []);

  // Last-ditch fallback: if we’re on /demo and still empty after the first effect tick, seed.
  useEffect(() => {
    if (!onDemoRoute()) return;
    if (transactions.length > 0) return;
    // give the first effect a moment; then seed if still empty
    const t = setTimeout(() => {
      if (transactions.length === 0) {
        try {
          const monthId =
            typeof process !== "undefined"
              ? (process.env.NEXT_PUBLIC_DEMO_MONTH as string | undefined)
              : undefined;
          const {
            id: seedId,
            transactions: seedTx,
            inputs: seedInputs,
          } = getDemoSeed(monthId);
          _setTransactions(seedTx);
          _setInputs(seedInputs);
          localStorage.setItem(LS_TX, JSON.stringify(seedTx));
          localStorage.setItem(LS_IN, JSON.stringify(seedInputs));
          localStorage.setItem(LS_DEMO_VER, String(DEMO_VERSION));
          localStorage.setItem(LS_DEMO_SIG, computeDemoSignature());
          sessionStorage.setItem(SS_DEMO_SEEDED, "1");

          writeCurrentId(seedId); // ✅ ensure a non-empty selection
        } catch {}
      }
    }, 0);
    return () => clearTimeout(t);
  }, [transactions.length]);

  // Persist to LS on changes
  useEffect(() => {
    try {
      localStorage.setItem(LS_TX, JSON.stringify(transactions));
    } catch {}
  }, [transactions]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_IN, JSON.stringify(inputs));
    } catch {}
  }, [inputs]);

  // Stable setters
  const setInputs = useCallback((next: SetInputs) => {
    _setInputs((prev) => {
      const value = typeof next === "function" ? (next as any)(prev) : next;
      return shallowEqualInputs(prev, value) ? prev : value;
    });
  }, []);

  const setTransactions = useCallback((next: SetTransactions) => {
    _setTransactions((prev) => {
      const value = typeof next === "function" ? (next as any)(prev) : next;
      return value === prev ? prev : (value as Transaction[]);
    });
  }, []);

  const clearAll = useCallback(() => {
    _setTransactions([]);
    _setInputs({
      beginningBalance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
    });
    try {
      localStorage.removeItem(LS_TX);
      localStorage.removeItem(LS_IN);
      sessionStorage.removeItem(SS_DEMO_SEEDED);
      // keep version/signature so we never reseed an older snapshot by accident
    } catch {}
  }, []);

  const api = useMemo<ReconcilerCtx>(
    () => ({
      transactions,
      setTransactions,
      inputs,
      setInputs,
      clearAll,
    }),
    [transactions, inputs, setTransactions, setInputs, clearAll]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useReconcilerSelectors(): ReconcilerCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useReconcilerSelectors must be used within ReconcilerProvider"
    );
  return ctx;
}
