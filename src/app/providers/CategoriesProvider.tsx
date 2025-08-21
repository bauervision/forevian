"use client";
import React from "react";
import { readIndex } from "@/lib/statements";
import { readCatRules } from "@/lib/categoryRules";
import {
  useAuthUID,
  userDoc,
  setWithRev,
  subscribeDoc,
  debounce,
} from "@/lib/fx";

type Ctx = {
  categories: string[];
  setCategories: (next: string[]) => void;
  addCategory: (name: string) => void;
  resetDefaults: () => void;
  recoverFromData: () => void;
  restoreBackup: () => void;
};

const CategoriesContext = React.createContext<Ctx | null>(null);

// Stable storage keys
const CATS_KEY = "ui.categories.v1";
const BACKUP_KEY = "ui.categories.backup.v1";

// Keep “Uncategorized” pinned first; dropdowns elsewhere sort alphabetically in their own components.
const DEFAULTS = [
  "Impulse/Misc",
  "Uncategorized",
  "Income",
  "Transfers",
  "Debt",
  "Cash Back",
  "Utilities",
  "Housing",
  "Insurance",
  "Subscriptions",
  "Groceries",
  "Dining",
  "Fast Food",
  "Gas",
  "Shopping/Household",
  "Entertainment",
  "Kids/School",
  "Amazon",
  "Starbucks",
  "Medical/Doctors",
];

function uniqOrder(arr: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const v = s?.trim();
    if (!v) continue;
    const norm = v.replace(/\s+/g, " ");
    if (!seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase());
      out.push(norm);
    }
  }
  return out;
}

function normalizeList(list: string[]): string[] {
  // 1) ensure uniqueness
  const uniques = uniqOrder(list);
  // 2) make sure “Uncategorized” exists and is first
  const rest = uniques.filter((c) => c.toLowerCase() !== "uncategorized");
  return ["Uncategorized", ...rest];
}

function loadStorage(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(String) : null;
  } catch {
    return null;
  }
}

function saveStorage(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

function snapshotBackup(list: string[]) {
  try {
    saveStorage(BACKUP_KEY, list);
  } catch {}
}

// Build a merged category list from defaults + rules + cached transactions
function buildFromData(): string[] {
  const base = new Set(DEFAULTS.map((c) => c));
  // From rules
  try {
    const rules = readCatRules(); // [{key, category, source}]
    for (const r of rules) {
      if (r?.category) base.add(String(r.category));
    }
  } catch {}

  // From cached statements
  try {
    const idx = readIndex();
    for (const s of Object.values(idx)) {
      const tx: any[] = Array.isArray((s as any)?.cachedTx)
        ? (s as any).cachedTx
        : [];
      for (const r of tx) {
        const cat = (r.categoryOverride ?? r.category) as string | undefined;
        if (cat && cat.trim()) base.add(cat.trim());
      }
    }
  } catch {}

  return normalizeList(Array.from(base));
}

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, setCats] = React.useState<string[]>(DEFAULTS);
  const uid = useAuthUID();
  // init: localStorage → else build from data → else defaults
  React.useEffect(() => {
    const stored = loadStorage(CATS_KEY);
    if (stored && stored.length) {
      const norm = normalizeList(stored);
      setCats(norm);
      snapshotBackup(norm);
      return;
    }
    const rebuilt = buildFromData();
    const norm = normalizeList(rebuilt.length ? rebuilt : DEFAULTS);
    setCats(norm);
    snapshotBackup(norm);
    saveStorage(CATS_KEY, norm);
  }, []);

  // 🔥 Firestore: pull remote -> push local (debounced)
  // Subscribe to remote when signed in
  React.useEffect(() => {
    if (!uid) return; // signed out, stick to localStorage
    const ref = userDoc(uid, "settings", "categories");
    return subscribeDoc<{ list: string[]; rev: number }>(ref, (data) => {
      if (!data) return; // nothing yet
      const remoteList = normalizeList(data.list ?? []);
      // If remote differs from local, prefer remote to keep devices consistent
      setCats((prev) => {
        const same =
          prev.length === remoteList.length &&
          prev.every((v, i) => v === remoteList[i]);
        return same ? prev : remoteList;
      });
    });
  }, [uid]);

  // Debounced remote save when categories change (and user is signed in)
  const saveRemote = React.useMemo(
    () =>
      debounce(async (list: string[]) => {
        if (!uid) return; // extra guard
        const ref = userDoc(uid, "settings", "categories");
        await setWithRev(ref, { list: normalizeList(list) });
      }, 700),
    [uid]
  );

  // Ensure we cancel any pending write when uid changes or unmounts
  React.useEffect(() => {
    return () => {
      // @ts-ignore – our debounce has cancel()
      saveRemote.cancel?.();
    };
  }, [saveRemote]);

  // Only schedule writes when signed-in
  React.useEffect(() => {
    if (!uid) return;
    saveRemote(categories);
  }, [uid, categories, saveRemote]);

  React.useEffect(() => {
    if (!uid) return;
    saveRemote(categories);
  }, [uid, categories, saveRemote]);

  // persist + backup on changes
  React.useEffect(() => {
    saveStorage(CATS_KEY, categories);
    snapshotBackup(categories);
  }, [categories]);

  const setCategories = React.useCallback((next: string[]) => {
    const norm = normalizeList(next);
    setCats(norm);
    saveStorage(CATS_KEY, norm);
    snapshotBackup(norm);
    // Firestore write is already debounced & uid-guarded
  }, []);

  const addCategory = React.useCallback((name: string) => {
    const v = name.trim();
    if (!v) return;
    setCats((prev) => normalizeList([v, ...prev]));
  }, []);

  const resetDefaults = React.useCallback(() => {
    const norm = normalizeList(DEFAULTS);
    setCats(norm);
  }, []);

  const restoreBackup = React.useCallback(() => {
    const backup = loadStorage(BACKUP_KEY);
    if (backup && backup.length) {
      setCats(normalizeList(backup));
    }
  }, []);

  const recoverFromData = React.useCallback(() => {
    const merged = buildFromData();
    setCats(normalizeList([...merged]));
  }, []);

  const value: Ctx = React.useMemo(
    () => ({
      categories,
      setCategories,
      addCategory,
      resetDefaults,
      recoverFromData,
      restoreBackup,
    }),
    [
      categories,
      setCategories,
      addCategory,
      resetDefaults,
      recoverFromData,
      restoreBackup,
    ]
  );

  React.useEffect(() => {
    if (!uid) return; // signed out, stick to local

    let unsub = () => {};
    const run = async () => {
      const ref = userDoc(uid, "settings", "categories");

      // one-time read/seed
      try {
        const snap = await (await import("firebase/firestore")).getDoc(ref);
        if (snap.exists()) {
          const remoteList = normalizeList(
            (snap.data().list ?? []) as string[]
          );
          setCats((prev) => {
            const same =
              prev.length === remoteList.length &&
              prev.every((v, i) => v === remoteList[i]);
            return same ? prev : remoteList;
          });
        } else {
          // seed from local or defaults
          const seed = normalizeList(loadStorage(CATS_KEY) ?? DEFAULTS);
          await setWithRev(ref, { list: seed });
          setCats(seed);
        }
      } catch (e) {
        console.debug("categories initial fetch error", e);
      }

      // live subscribe
      unsub = subscribeDoc<{ list: string[]; rev: number }>(ref, (data) => {
        if (!data) return;
        const remoteList = normalizeList(data.list ?? []);
        setCats((prev) => {
          const same =
            prev.length === remoteList.length &&
            prev.every((v, i) => v === remoteList[i]);
          return same ? prev : remoteList;
        });
      });
    };

    run();
    return () => unsub();
  }, [uid]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = React.useContext(CategoriesContext);
  if (!ctx)
    throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
