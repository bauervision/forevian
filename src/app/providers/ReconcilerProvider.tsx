"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

export type Transaction = {
  id: string;
  date: string; // ISO (yyyy-mm-dd) or original string if you prefer
  description: string;
  amount: number; // signed; deposits > 0, withdrawals < 0
  raw?: string; // original pasted line (optional)
  notes?: string;
  category?: string;
  categoryOverride?: string;
  parseWarnings?: string[];
};

export type UserInputs = {
  beginningBalance: number | null;
  totalDeposits: number | null; // expected sum of positive amounts
  totalWithdrawals: number | null; // expected sum of absolute value of negatives
};

export type Settings = {
  toleranceCents: number; // e.g. 1 = $0.01
  currency: "USD"; // leave extensible
};

export type Derived = {
  depositTotal: number; // sum of > 0
  withdrawalTotalAbs: number; // sum of absolute values of < 0
  endingBalance: number | null; // if beginningBalance is set, compute
  discrepancies: {
    deposits: number | null; // parsed - provided
    withdrawals: number | null; // parsed - provided
    endingBalance: number | null; // computed - inferredProvided
  };
};

export type ReconcilerState = {
  transactions: Transaction[];
  userInputs: UserInputs;
  settings: Settings;
  derived: Derived;
  version: number;
};

type Action =
  | { type: "SET_TRANSACTIONS"; transactions: Transaction[] }
  | { type: "UPSERT_TRANSACTION"; tx: Transaction }
  | { type: "REMOVE_TRANSACTION"; id: string }
  | { type: "SET_USER_INPUTS"; userInputs: Partial<UserInputs> }
  | { type: "SET_SETTINGS"; settings: Partial<Settings> }
  | { type: "RESET_ALL" };

const VERSION = 1;
const STORAGE_KEY = "reconciler.v1";

function computeDerived(state: Omit<ReconcilerState, "derived">): Derived {
  const depositTotal = state.transactions.reduce(
    (s, t) => s + (t.amount > 0 ? t.amount : 0),
    0
  );
  const withdrawalTotalAbs = state.transactions.reduce(
    (s, t) => s + (t.amount < 0 ? Math.abs(t.amount) : 0),
    0
  );

  // compute ending (if we have a beginning)
  const endingBalance =
    state.userInputs.beginningBalance == null
      ? null
      : state.userInputs.beginningBalance + depositTotal - withdrawalTotalAbs;

  const discrepancies = {
    deposits:
      state.userInputs.totalDeposits == null
        ? null
        : depositTotal - state.userInputs.totalDeposits,
    withdrawals:
      state.userInputs.totalWithdrawals == null
        ? null
        : withdrawalTotalAbs - state.userInputs.totalWithdrawals,
    endingBalance: (() => {
      if (endingBalance == null) return null;
      // If user gave both totals, infer “provided ending” from those:
      if (
        state.userInputs.beginningBalance != null &&
        state.userInputs.totalDeposits != null &&
        state.userInputs.totalWithdrawals != null
      ) {
        const inferredProvidedEnding =
          state.userInputs.beginningBalance +
          state.userInputs.totalDeposits -
          state.userInputs.totalWithdrawals;
        return endingBalance - inferredProvidedEnding;
      }
      return null;
    })(),
  };

  return { depositTotal, withdrawalTotalAbs, endingBalance, discrepancies };
}

function withDerived(
  partial: Omit<ReconcilerState, "derived">
): ReconcilerState {
  return { ...partial, derived: computeDerived(partial) };
}

const initialState: ReconcilerState = withDerived({
  transactions: [],
  userInputs: {
    beginningBalance: null,
    totalDeposits: null,
    totalWithdrawals: null,
  },
  settings: { toleranceCents: 1, currency: "USD" },
  version: VERSION,
});

function reducer(state: ReconcilerState, action: Action): ReconcilerState {
  switch (action.type) {
    case "SET_TRANSACTIONS": {
      const next = { ...state, transactions: action.transactions };
      return withDerived(next);
    }
    case "UPSERT_TRANSACTION": {
      const idx = state.transactions.findIndex((t) => t.id === action.tx.id);
      const nextTxs =
        idx >= 0
          ? state.transactions.map((t) =>
              t.id === action.tx.id ? action.tx : t
            )
          : [...state.transactions, action.tx];
      return withDerived({ ...state, transactions: nextTxs });
    }
    case "REMOVE_TRANSACTION": {
      const nextTxs = state.transactions.filter((t) => t.id !== action.id);
      return withDerived({ ...state, transactions: nextTxs });
    }
    case "SET_USER_INPUTS": {
      const next = {
        ...state,
        userInputs: { ...state.userInputs, ...action.userInputs },
      };
      return withDerived(next);
    }
    case "SET_SETTINGS": {
      const next = {
        ...state,
        settings: { ...state.settings, ...action.settings },
      };
      return withDerived(next);
    }
    case "RESET_ALL": {
      return initialState;
    }
    default:
      return state;
  }
}

type CtxValue = {
  state: ReconcilerState;
  // actions
  setTransactions: (txs: Transaction[]) => void;
  upsertTransaction: (tx: Transaction) => void;
  removeTransaction: (id: string) => void;
  setUserInputs: (patch: Partial<UserInputs>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  resetAll: () => void;
  // helpers
  isWithinTolerance: (n: number | null) => boolean;
};

const ReconcilerContext = createContext<CtxValue | null>(null);

function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  delay = 400
) {
  const timeout = useRef<any>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  ) as T;
}

function loadFromStorage(): ReconcilerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReconcilerState;
    if (parsed.version !== VERSION) return null;
    // Recompute derived to be safe
    return withDerived({
      transactions: parsed.transactions ?? [],
      userInputs: parsed.userInputs ?? initialState.userInputs,
      settings: parsed.settings ?? initialState.settings,
      version: VERSION,
    });
  } catch {
    return null;
  }
}

export function ReconcilerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // hydrate from localStorage once
  useEffect(() => {
    const loaded = loadFromStorage();
    if (loaded) {
      dispatch({ type: "SET_TRANSACTIONS", transactions: loaded.transactions });
      dispatch({ type: "SET_USER_INPUTS", userInputs: loaded.userInputs });
      dispatch({ type: "SET_SETTINGS", settings: loaded.settings });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useDebouncedCallback((s: ReconcilerState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
  }, 500);

  useEffect(() => {
    persist(state);
  }, [state, persist]);

  const setTransactions = useCallback((txs: Transaction[]) => {
    dispatch({ type: "SET_TRANSACTIONS", transactions: txs });
  }, []);
  const upsertTransaction = useCallback((tx: Transaction) => {
    dispatch({ type: "UPSERT_TRANSACTION", tx });
  }, []);
  const removeTransaction = useCallback((id: string) => {
    dispatch({ type: "REMOVE_TRANSACTION", id });
  }, []);
  const setUserInputs = useCallback((patch: Partial<UserInputs>) => {
    dispatch({ type: "SET_USER_INPUTS", userInputs: patch });
  }, []);
  const setSettings = useCallback((patch: Partial<Settings>) => {
    dispatch({ type: "SET_SETTINGS", settings: patch });
  }, []);
  const resetAll = useCallback(() => {
    dispatch({ type: "RESET_ALL" });
  }, []);

  const isWithinTolerance = useCallback(
    (n: number | null) => {
      if (n == null) return true;
      return Math.abs(Math.round(n * 100)) <= state.settings.toleranceCents;
    },
    [state.settings.toleranceCents]
  );

  const value = useMemo<CtxValue>(
    () => ({
      state,
      setTransactions,
      upsertTransaction,
      removeTransaction,
      setUserInputs,
      setSettings,
      resetAll,
      isWithinTolerance,
    }),
    [
      state,
      setTransactions,
      upsertTransaction,
      removeTransaction,
      setUserInputs,
      setSettings,
      resetAll,
      isWithinTolerance,
    ]
  );

  return (
    <ReconcilerContext.Provider value={value}>
      {children}
    </ReconcilerContext.Provider>
  );
}

// Public hooks
export function useReconciler() {
  const ctx = useContext(ReconcilerContext);
  if (!ctx)
    throw new Error("useReconciler must be used within ReconcilerProvider");
  return ctx;
}

// Handy selectors hook: memoize common values
export function useReconcilerSelectors() {
  const { state, isWithinTolerance } = useReconciler();

  return useMemo(() => {
    const {
      derived: {
        depositTotal,
        withdrawalTotalAbs,
        endingBalance,
        discrepancies,
      },
      userInputs: { beginningBalance, totalDeposits, totalWithdrawals },
    } = state;

    const depositOk =
      discrepancies.deposits == null
        ? null
        : isWithinTolerance(discrepancies.deposits);
    const withdrawalOk =
      discrepancies.withdrawals == null
        ? null
        : isWithinTolerance(discrepancies.withdrawals);
    const endingOk =
      discrepancies.endingBalance == null
        ? null
        : isWithinTolerance(discrepancies.endingBalance);

    return {
      transactions: state.transactions,
      settings: state.settings,
      inputs: state.userInputs,
      totals: {
        depositTotal,
        withdrawalTotalAbs,
        endingBalance,
      },
      discrepancies,
      flags: {
        depositOk,
        withdrawalOk,
        endingOk,
      },
    };
  }, [state, isWithinTolerance]);
}
