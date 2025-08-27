"use client";

import * as React from "react";

type CtxShape = {
  categories: string[];
  setAll: (next: string[]) => void;
  setCategories: (next: string[]) => void; // alias of setAll
};

const CategoriesContext = React.createContext<CtxShape | null>(null);

const LS_KEY = "categories.v2";

/* ---------- small utils ---------- */
const isBrowser = () => typeof window !== "undefined";

function useIsDemoRoute() {
  const [demo, setDemo] = React.useState(false);
  React.useEffect(() => {
    if (!isBrowser()) return;
    try {
      setDemo(window.location.pathname.startsWith("/demo"));
    } catch {
      setDemo(false);
    }
  }, []);
  return demo;
}

function normalizeList(list: unknown): string[] {
  const out = new Set<string>();
  if (Array.isArray(list)) {
    for (const x of list) {
      const s = String(x ?? "").trim();
      if (s) out.add(s);
    }
  }
  // Keep “Uncategorized” last for nicer UX
  const arr = Array.from(out).sort((a, b) =>
    a.toLowerCase() === "uncategorized"
      ? 1
      : b.toLowerCase() === "uncategorized"
      ? -1
      : a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  if (!arr.some((x) => x.toLowerCase() === "uncategorized")) {
    arr.push("Uncategorized");
  }
  return arr;
}

function unionCaseInsensitive(a: string[], b: string[]) {
  const lower = new Set(a.map((x) => x.toLowerCase()));
  const merged = [...a];
  for (const item of b) {
    if (!lower.has(item.toLowerCase())) {
      lower.add(item.toLowerCase());
      merged.push(item);
    }
  }
  return normalizeList(merged);
}

/* ---------- derive demo baseline (lazy require) ---------- */
function deriveDemoBaseline(): string[] {
  try {
    // Lazy require to avoid bundling demo data for non-demo routes
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DEMO_MONTHS } = require("@/app/demo/data");
    const set = new Set<string>();
    for (const m of DEMO_MONTHS as any[]) {
      for (const t of (m?.cachedTx ?? []) as any[]) {
        const c = String(
          (t?.categoryOverride ?? t?.category ?? "Uncategorized") || ""
        ).trim();
        if (c) set.add(c);
      }
    }
    set.add("Uncategorized");
    set.add("Impulse/Misc");
    return normalizeList(Array.from(set));
  } catch {
    return ["Uncategorized"];
  }
}

/* ---------- provider ---------- */
export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDemo = useIsDemoRoute();

  const [categories, _setCategories] = React.useState<string[]>([]);

  // Initial hydrate from LS + union demo baseline if /demo
  React.useEffect(() => {
    let initial: string[] = [];
    if (isBrowser()) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) initial = normalizeList(parsed);
        }
      } catch {}
    }

    if (isDemo) {
      const baseline = deriveDemoBaseline();
      initial = unionCaseInsensitive(initial, baseline);
    }

    _setCategories(initial);
  }, [isDemo]);

  // Persist on change
  React.useEffect(() => {
    if (!isBrowser()) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  // Stable setters
  const setAll = React.useCallback((next: string[]) => {
    _setCategories((prev) => {
      const normalized = normalizeList(next);
      // shallow compare to avoid loops
      if (
        prev.length === normalized.length &&
        prev.every((v, i) => v === normalized[i])
      ) {
        return prev;
      }
      return normalized;
    });
  }, []);
  const setCategories = setAll;

  const value = React.useMemo<CtxShape>(
    () => ({ categories, setAll, setCategories }),
    [categories, setAll]
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

/* ---------- exported hook ---------- */
export function useCategories(): CtxShape {
  const ctx = React.useContext(CategoriesContext);
  if (!ctx) {
    throw new Error(
      "useCategories must be used within <CategoriesProvider> at the app root."
    );
  }
  return ctx;
}

/* ---------- helper: ensure a label exists globally ---------- */
export function useEnsureCategoryExists() {
  const { categories, setAll } = useCategories();
  return React.useCallback(
    (label: string) => {
      const name = (label || "").trim();
      if (!name) return;
      const lower = new Set(categories.map((c) => c.toLowerCase()));
      if (lower.has(name.toLowerCase())) return;
      setAll([...categories, name]);
    },
    [categories, setAll]
  );
}
