"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
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

type ReconcilerCtx = {
  transactions: Transaction[];
  setTransactions: (rows: Transaction[]) => void;
  inputs: ReconcilerInputs;
  setInputs: (i: ReconcilerInputs) => void;
  clearAll: () => void;
};

const Ctx = createContext<ReconcilerCtx | null>(null);

const LS_TX = "reconciler.tx.v1";
const LS_IN = "reconciler.inputs.v1";

export function ReconcilerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transactions, setTransactionsState] = useState<Transaction[]>([]);
  const [inputs, setInputsState] = useState<ReconcilerInputs>({
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
        if (Array.isArray(parsed))
          setTransactionsState(parsed as Transaction[]);
      }
    } catch {}
    try {
      const rawIn = localStorage.getItem(LS_IN);
      if (rawIn) {
        const parsed = JSON.parse(rawIn);
        if (parsed && typeof parsed === "object")
          setInputsState(parsed as ReconcilerInputs);
      }
    } catch {}
  }, []);

  // persist to localStorage
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

  const api = useMemo<ReconcilerCtx>(
    () => ({
      transactions,
      setTransactions: (rows) => setTransactionsState(rows),
      inputs,
      setInputs: (i) => setInputsState(i),
      clearAll: () => {
        setTransactionsState([]);
        setInputsState({
          beginningBalance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
        });
        try {
          localStorage.removeItem(LS_TX);
          localStorage.removeItem(LS_IN);
        } catch {}
      },
    }),
    [transactions, inputs]
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
