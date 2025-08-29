// app/providers/CategoriesProvider.tsx
"use client";

import * as React from "react";
import { catToSlug } from "@/lib/slug";
import { DEFAULT_CATEGORIES } from "@/lib/categories/defaults";

export type Category = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  hint?: string;
  slug: string;
};

type CtxShape = {
  categories: Category[];
  setAll: (next: Category[]) => void;
  setCategories: (next: Category[]) => void; // alias
  ensureExistsByName?: (name: string) => void;
};

const CategoriesContext = React.createContext<CtxShape | null>(null);

// Storage keys
const LS_V3 = "categories.v3"; // Category[]
const LS_V2 = "categories.v2"; // string[] (legacy)

/* -------------------------- helpers / sanitizers -------------------------- */

const isBrowser = () => typeof window !== "undefined";

function normalizeAndUniq(next: Category[]): Category[] {
  // ensure normalized unique slugs (no %2F, no spaces)
  const seen = new Set<string>();
  return next.map((c) => {
    let slug = (c.slug && c.slug.trim()) || catToSlug(c.name);
    if (!slug) slug = catToSlug(c.id || c.name);
    const base = slug;
    let i = 2;
    while (seen.has(slug)) slug = `${base}-${i++}`;
    seen.add(slug);
    return { ...c, slug };
  });
}

function dedupeBySlugKeepFirst(list: Category[]): Category[] {
  const out: Category[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    const key = (c.slug || "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function mergeIntoDefaults(v3: Category[]): Category[] {
  const base = normalizeAndUniq(DEFAULT_CATEGORIES);
  const byName = new Map(base.map((c) => [c.name.toLowerCase(), c]));
  const merged: Category[] = [...base];

  for (const c of v3) {
    const n = c.name.trim().toLowerCase();
    if (!n) continue;
    if (byName.has(n)) continue; // already present in defaults -> skip
    merged.push(c);
  }
  return dedupeBySlugKeepFirst(normalizeAndUniq(merged));
}

function migrateV2StringsToV3(v2: string[]): Category[] {
  const uniqNames = Array.from(
    new Set((v2 || []).map((s) => String(s || "").trim()).filter(Boolean))
  );
  return uniqNames.map((name) => ({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `cat-${Math.random().toString(36).slice(2)}`,
    name,
    icon: "",
    color: "#475569",
    hint: "",
    slug: catToSlug(name),
  }));
}

/* -------------------------------- provider -------------------------------- */

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, _setCategories] = React.useState<Category[]>([]);

  // Initial hydrate (no demo unions, no alias folding)
  React.useEffect(() => {
    if (!isBrowser()) {
      _setCategories([]);
      return;
    }

    let next: Category[] | null = null;

    // Try v3 (Category[])
    try {
      const rawV3 = localStorage.getItem(LS_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3);
        if (Array.isArray(parsed)) next = parsed as Category[];
      }
    } catch {}

    // Migrate v2 (string[]) -> v3 if needed
    if (!next) {
      try {
        const rawV2 = localStorage.getItem(LS_V2);
        if (rawV2) {
          const parsed = JSON.parse(rawV2);
          if (Array.isArray(parsed)) {
            next = migrateV2StringsToV3(parsed);
          }
        }
      } catch {}
    }

    // Seed from shared defaults if still empty
    if (!next) next = DEFAULT_CATEGORIES;

    // Sanitize: just merge into defaults (no alias maps)
    next = mergeIntoDefaults(next);

    _setCategories(next);

    try {
      localStorage.setItem(LS_V3, JSON.stringify(next));
      localStorage.removeItem(LS_V2); // optional cleanup
    } catch {}
  }, []);

  // Persist on change
  React.useEffect(() => {
    if (!isBrowser()) return;
    try {
      localStorage.setItem(LS_V3, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  // Stable setter with sanitization
  const setAll = React.useCallback((next: Category[]) => {
    _setCategories((prev) => {
      const sanitized = mergeIntoDefaults(next);
      // shallow-ish compare to avoid loops
      if (
        prev.length === sanitized.length &&
        prev.every(
          (p, i) => p.id === sanitized[i].id && p.slug === sanitized[i].slug
        )
      ) {
        return prev;
      }
      return sanitized;
    });
  }, []);

  const setCategories = setAll;

  // helper for quick “ensure exists”
  const ensureExistsByName = React.useCallback(
    (name: string) => {
      const label = (name || "").trim();
      if (!label) return;
      const slug = catToSlug(label);
      const lowerSlugs = categories.map((c) => (c.slug || "").toLowerCase());
      if (lowerSlugs.includes(slug)) return;

      const next: Category[] = [
        ...categories,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `cat-${Math.random().toString(36).slice(2)}`,
          name: label,
          icon: "",
          color: "#475569",
          hint: "",
          slug,
        },
      ];
      setAll(next);
    },
    [categories, setAll]
  );

  const value = React.useMemo<CtxShape>(
    () => ({ categories, setAll, setCategories, ensureExistsByName }),
    [categories, setAll]
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories(): CtxShape {
  const ctx = React.useContext(CategoriesContext);
  if (!ctx)
    throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
