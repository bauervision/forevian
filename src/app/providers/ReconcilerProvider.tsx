"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

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
  category?: string; // base auto category
  categoryOverride?: string; // user-selected category (takes precedence)
  cardLast4?: string; // e.g., "0161", "5280"
  user?: string; // "Mike" | "Beth" | "Joint"
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

/* ------------ small equality helpers to avoid no-op updates ------------- */

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

function equalTxArrays(a: Transaction[], b: Transaction[]) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  // cheap pass: compare ids in order (works for our flows)
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

/* -------------------------------- provider ------------------------------- */

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

  // hydrate from localStorage on mount
  useEffect(() => {
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
  }, []);

  // persist to localStorage (only when primitives actually change)
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

  // stable, idempotent setters
  const setInputs = useCallback((next: SetInputs) => {
    _setInputs((prev) => {
      const value = typeof next === "function" ? (next as any)(prev) : next;
      return shallowEqualInputs(prev, value) ? prev : value;
    });
  }, []);

  const setTransactions = useCallback((next: SetTransactions) => {
    _setTransactions((prev) => {
      const value = typeof next === "function" ? (next as any)(prev) : next;
      return equalTxArrays(prev, value as Transaction[])
        ? prev
        : (value as Transaction[]);
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
    } catch {}
  }, []);

  // memoize context with stable function refs
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
