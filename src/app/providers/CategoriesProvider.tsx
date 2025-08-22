"use client";

import * as React from "react";
import {
  useAuthUID,
  userDoc,
  setWithRev,
  subscribeDoc,
  debounce,
} from "@/lib/fx";
import { readCatRules } from "@/lib/categoryRules";
import { readIndex } from "@/lib/statements";

/* ----------------------------- types & context ---------------------------- */

type Ctx = {
  categories: string[];
  setCategories: (next: string[]) => void;
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;

  // kept for compatibility with existing UI, but NOT using baked-in defaults
  resetDefaults: () => void; // -> resets to ["Uncategorized"]
  recoverFromData: () => void; // -> scans rules + cached tx to rebuild a list
  restoreBackup: () => void; // -> restores the last saved copy
};

const CategoriesContext = React.createContext<Ctx | undefined>(undefined);

/* --------------------------------- utils --------------------------------- */

function uniqPreserve<T>(
  xs: T[],
  key = (x: T) => String(x).toLowerCase()
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of xs) {
    const k = key(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

function normalizeList(input: string[]): string[] {
  // trim, drop blanks, ensure "Uncategorized" exists and is first, uniq CI, preserve order
  const trimmed = input.map((s) => (s ?? "").trim()).filter(Boolean);
  const withoutUncat = trimmed.filter(
    (s) => s.toLowerCase() !== "uncategorized"
  );
  const merged = uniqPreserve<string>(["Uncategorized", ...withoutUncat]);
  return merged;
}

function eqCI(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++)
    if (a[i].toLowerCase() !== b[i].toLowerCase()) return false;
  return true;
}

function lsKey(uid?: string | null) {
  return `ui.categories.v1::${uid ?? "anon"}`;
}
function lsBackupKey(uid?: string | null) {
  return `ui.categories.backup.v1::${uid ?? "anon"}`;
}
function startersKey(uid?: string | null) {
  return `ui.import.starters.cats::${uid ?? "anon"}`;
}
function startersAppliedKey(uid?: string | null) {
  return `ui.import.starters.applied::${uid ?? "anon"}`;
}

function safeReadJSON<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function readOnboardingCategoryNames(uid?: string | null): string[] {
  // onboarding stored [{id,name,icon?,color?}] or string[]
  const blob = safeReadJSON<any[]>(startersKey(uid)) ?? [];
  if (!Array.isArray(blob)) return [];
  const names = blob
    .map((x) => (typeof x === "string" ? x : x?.name))
    .filter(Boolean);
  return normalizeList(names);
}

/* ------------------------------- provider -------------------------------- */

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = useAuthUID();

  // Start minimal; we’ll hydrate from local -> firestore -> onboarding
  const [categories, _setCategories] = React.useState<string[]>([
    "Uncategorized",
  ]);
  const categoriesRef = React.useRef(categories);
  React.useEffect(
    () => void (categoriesRef.current = categories),
    [categories]
  );

  // Local backup each time we change (before remote debounce)
  const saveLocal = React.useCallback(
    (list: string[]) => {
      try {
        localStorage.setItem(lsKey(uid), JSON.stringify(list));
        localStorage.setItem(lsBackupKey(uid), JSON.stringify(list));
      } catch {}
    },
    [uid]
  );

  // Debounced remote save
  const saveRemote = React.useMemo(
    () =>
      debounce(async (list: string[]) => {
        if (!uid) return;
        try {
          const ref = userDoc(uid, "settings", "categories");
          await setWithRev(ref, { list });
        } catch {
          /* ignore remote errors */
        }
      }, 500),
    [uid]
  );

  // Public setter — normalize, persist local + remote
  const setCategories = React.useCallback(
    (next: string[]) => {
      const norm = normalizeList(next || []);
      if (eqCI(categoriesRef.current, norm)) return;
      _setCategories(norm);
      saveLocal(norm);
      saveRemote(norm);
    },
    [saveLocal, saveRemote]
  );

  // Add/remove helpers
  const addCategory = React.useCallback(
    (name: string) => {
      const norm = normalizeList([...categoriesRef.current, name]);
      if (!eqCI(categoriesRef.current, norm)) setCategories(norm);
    },
    [setCategories]
  );

  const removeCategory = React.useCallback(
    (name: string) => {
      const norm = normalizeList(
        categoriesRef.current.filter(
          (c) => c.toLowerCase() !== (name || "").toLowerCase()
        )
      );
      if (!eqCI(categoriesRef.current, norm)) setCategories(norm);
    },
    [setCategories]
  );

  // Local boot
  React.useEffect(() => {
    const local = safeReadJSON<string[]>(lsKey(uid));
    if (Array.isArray(local) && local.length) {
      _setCategories(normalizeList(local));
    }
  }, [uid]);

  // Remote subscribe (if logged in)
  React.useEffect(() => {
    if (!uid) return;
    const ref = userDoc(uid, "settings", "categories");
    return subscribeDoc<{ list?: string[]; rev?: number }>(ref, (data) => {
      const incoming = normalizeList(
        Array.isArray(data?.list) ? data!.list : []
      );
      if (!incoming.length) return; // ignore empty remote payloads
      if (!eqCI(categoriesRef.current, incoming)) {
        _setCategories(incoming);
        // also refresh local caches
        try {
          localStorage.setItem(lsKey(uid), JSON.stringify(incoming));
          localStorage.setItem(lsBackupKey(uid), JSON.stringify(incoming));
        } catch {}
      }
    });
  }, [uid]);

  // Adopt onboarding categories ONCE per user/session if current is baseline (only Uncategorized)
  React.useEffect(() => {
    const applied =
      typeof window !== "undefined"
        ? localStorage.getItem(startersAppliedKey(uid))
        : "1";
    if (applied) return;

    const current = categoriesRef.current;
    const baseline = current.length <= 1; // treat 0/1 as baseline

    const starters = readOnboardingCategoryNames(uid);
    if (!starters.length) {
      try {
        localStorage.setItem(startersAppliedKey(uid), "1");
      } catch {}
      return;
    }

    if (baseline || !eqCI(current, starters)) {
      setCategories(starters);
    }

    try {
      localStorage.setItem(startersAppliedKey(uid), "1");
    } catch {}
  }, [uid, setCategories]);

  /* ---------------------------- compat utilities --------------------------- */

  // “Reset defaults” now means “minimal reset” (no baked-in list).
  const resetDefaults = React.useCallback(() => {
    setCategories(["Uncategorized"]);
  }, [setCategories]);

  // Recover by scanning rules & cached transactions
  const recoverFromData = React.useCallback(() => {
    const ruleMap = readCatRules(); // your structure likely { key: "Category" }
    const fromRules = Object.values(ruleMap || {}) as unknown as string[];

    const idx = readIndex();
    const fromTx = new Set<string>();
    for (const s of Object.values(idx || {})) {
      const rows = Array.isArray((s as any).cachedTx)
        ? (s as any).cachedTx
        : [];
      for (const r of rows) {
        const c = (r?.categoryOverride || r?.category || "").trim();
        if (c) fromTx.add(c);
      }
    }

    const next = normalizeList([...fromRules, ...Array.from(fromTx)]);
    if (next.length === 0) return;
    setCategories(next);
  }, [setCategories]);

  const restoreBackup = React.useCallback(() => {
    const backup = safeReadJSON<string[]>(lsBackupKey(uid)) || [];
    if (!backup.length) return;
    setCategories(backup);
  }, [uid, setCategories]);

  const value = React.useMemo<Ctx>(
    () => ({
      categories,
      setCategories,
      addCategory,
      removeCategory,
      resetDefaults,
      recoverFromData,
      restoreBackup,
    }),
    [
      categories,
      setCategories,
      addCategory,
      removeCategory,
      resetDefaults,
      recoverFromData,
      restoreBackup,
    ]
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

/* ---------------------------------- hook --------------------------------- */

export function useCategories(): Ctx {
  const ctx = React.useContext(CategoriesContext);
  if (!ctx)
    throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
