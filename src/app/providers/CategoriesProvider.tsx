"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type CategoriesCtx = {
  categories: string[];
  addCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => void;
  removeCategory: (name: string) => void;
  setCategories: (list: string[]) => void;
  resetDefaults: () => void;
};

const DEFAULTS = [
  "Amazon",
  "Groceries",
  "Dining",
  "Fast Food",
  "Shopping/Household",
  "Utilities",
  "Housing",
  "Debt",
  "Insurance",
  "Subscriptions",
  "Gas",
  "Entertainment",
  "Transfers",
  "Fees",
  "Cash Back",
  "Travel",
  "Kids/School",
  "Impulse/Misc",
  "Uncategorized",
];

const LS_KEY = "categories.v1";
const Ctx = createContext<CategoriesCtx | null>(null);

function putUncatLast(list: string[]) {
  const deduped = Array.from(
    new Set(list.map((s) => s.trim()).filter(Boolean))
  );
  const without = deduped.filter((c) => c.toLowerCase() !== "uncategorized");
  return [...without, "Uncategorized"];
}

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, setCategoriesState] = useState<string[]>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) setCategoriesState(parsed);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  const api = useMemo<CategoriesCtx>(
    () => ({
      categories,
      addCategory: (name) =>
        setCategoriesState((prev) => {
          const n = name.trim();
          if (!n) return prev;
          const withoutUncat = prev.filter(
            (c) => c.toLowerCase() !== "uncategorized"
          );
          const withoutDup = withoutUncat.filter(
            (c) => c.toLowerCase() !== n.toLowerCase()
          );
          return putUncatLast([n, ...withoutDup]);
        }),
      renameCategory: (oldName, newName) =>
        setCategoriesState((prev) => {
          const list = prev.map((c) => (c === oldName ? newName : c));
          return putUncatLast(list);
        }),
      removeCategory: (name) =>
        setCategoriesState((prev) =>
          putUncatLast(prev.filter((c) => c !== name && c !== "Uncategorized"))
        ),
      setCategories: (list) => setCategoriesState(putUncatLast(list)),
      resetDefaults: () => setCategoriesState(DEFAULTS),
    }),
    [categories]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCategories(): CategoriesCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
