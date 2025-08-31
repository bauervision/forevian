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
  createdAt?: number;
  updatedAt?: number;
};

type UpsertInput = {
  name: string;
  icon?: string;
  color?: string;
  hint?: string;
  slug?: string;
};

type CtxShape = {
  categories: Category[];
  setAll: (next: Category[]) => void;
  setCategories: (next: Category[]) => void; // alias
  ensureExistsByName?: (name: string) => void;

  /** NEW: helpers for canonical lookup */
  findBySlug: (slug: string) => Category | undefined;
  findByNameCI: (name: string) => Category | undefined;

  /** NEW: single upsert that prefers newer + preserves existing icon */
  upsertCategory: (input: UpsertInput) => Category;
};

const CategoriesContext = React.createContext<CtxShape | null>(null);

// Storage keys
const LS_V3 = "categories.v3"; // Category[]
const LS_V2 = "categories.v2"; // string[] (legacy)

/* -------------------------- helpers / sanitizers -------------------------- */

const isBrowser = () => typeof window !== "undefined";

const normalizeName = (s: string) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ");

const slugify = (s: string) => {
  const n = normalizeName(s);
  const slug = catToSlug(n);
  return slug || "uncategorized";
};

function withId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cat-${Math.random().toString(36).slice(2)}`;
}

function normalizeAndUniq(next: Category[]): Category[] {
  const seen = new Set<string>();
  return next.map((c) => {
    const name = normalizeName(c.name || c.slug || c.id);
    let slug = (c.slug && c.slug.trim()) || slugify(name);
    if (!slug) slug = slugify(c.id || name);

    const base = slug;
    let i = 2;
    while (seen.has(slug)) slug = `${base}-${i++}`;
    seen.add(slug);

    return {
      id: c.id || withId(),
      name,
      icon: c.icon || "",
      color: c.color || "#475569",
      hint: c.hint || "",
      slug,
      createdAt: c.createdAt ?? Date.now(),
      updatedAt: c.updatedAt ?? Date.now(),
    };
  });
}

/**
 * Merge by slug, preferring:
 *  1) newer updatedAt
 *  2) if tie or missing timestamps, the one that HAS an icon
 *  3) otherwise keep first
 */
function mergeBySlugPreferNewer(list: Category[]): Category[] {
  const map = new Map<string, Category>();
  for (const raw of list) {
    const c = {
      ...raw,
      name: normalizeName(raw.name || raw.slug),
      slug: raw.slug || slugify(raw.name || raw.id),
      id: raw.id || withId(),
      createdAt: raw.createdAt ?? Date.now(),
      updatedAt: raw.updatedAt ?? Date.now(),
    };
    const key = c.slug.toLowerCase();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, c);
      continue;
    }
    const newer =
      (c.updatedAt ?? 0) > (prev.updatedAt ?? 0)
        ? c
        : (c.updatedAt ?? 0) < (prev.updatedAt ?? 0)
        ? prev
        : c.icon && !prev.icon
        ? c
        : prev;

    const icon = newer.icon || prev.icon || "";
    map.set(key, { ...newer, icon });
  }

  if (!map.has("uncategorized")) {
    map.set("uncategorized", {
      id: withId(),
      name: "Uncategorized",
      slug: "uncategorized",
      color: "#475569",
      hint: "",
      icon: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return Array.from(map.values());
}

/** Merge defaults + incoming (user) with the same preference rules */
function mergeIntoDefaults(v3: Category[]): Category[] {
  const base = normalizeAndUniq(DEFAULT_CATEGORIES);
  const incoming = normalizeAndUniq(v3 || []);
  return mergeBySlugPreferNewer([...base, ...incoming]);
}

function migrateV2StringsToV3(v2: string[]): Category[] {
  const uniqNames = Array.from(
    new Set((v2 || []).map((s) => String(s || "").trim()).filter(Boolean))
  );
  return uniqNames.map((name) => ({
    id: withId(),
    name: normalizeName(name),
    icon: "",
    color: "#475569",
    hint: "",
    slug: slugify(name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

/* -------------------------------- provider -------------------------------- */

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, _setCategories] = React.useState<Category[]>([]);

  // Initial hydrate
  React.useEffect(() => {
    if (!isBrowser()) {
      _setCategories([]);
      return;
    }

    let next: Category[] | null = null;

    try {
      const rawV3 = localStorage.getItem(LS_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3);
        if (Array.isArray(parsed)) next = parsed as Category[];
      }
    } catch {}

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

    if (!next) next = DEFAULT_CATEGORIES;

    next = mergeIntoDefaults(next);

    _setCategories(next);

    try {
      localStorage.setItem(LS_V3, JSON.stringify(next));
      localStorage.removeItem(LS_V2);
    } catch {}
  }, []);

  // Persist on change
  React.useEffect(() => {
    if (!isBrowser()) return;
    try {
      localStorage.setItem(LS_V3, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  const setAll = React.useCallback((next: Category[]) => {
    _setCategories((prev) => {
      const sanitized = mergeIntoDefaults(next);
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

  const findBySlug = React.useCallback(
    (slug: string) => {
      const key = String(slug || "").toLowerCase();
      return categories.find((c) => c.slug.toLowerCase() === key);
    },
    [categories]
  );

  const findByNameCI = React.useCallback(
    (name: string) => {
      const n = normalizeName(name).toLowerCase();
      return categories.find((c) => c.name.toLowerCase() === n);
    },
    [categories]
  );

  const upsertCategory = React.useCallback(
    (input: UpsertInput): Category => {
      const now = Date.now();
      const name = normalizeName(input.name);
      const slug = (input.slug && input.slug.trim()) || slugify(name);
      const existing = findBySlug(slug) || findByNameCI(name);

      const nextCat: Category = {
        id: existing?.id || withId(),
        name,
        slug,
        icon: input.icon ?? existing?.icon ?? "",
        color: input.color ?? existing?.color ?? "#475569",
        hint: input.hint ?? existing?.hint ?? "",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      setAll([...(categories || []), nextCat]);
      return nextCat;
    },
    [categories, setAll, findBySlug, findByNameCI]
  );

  const ensureExistsByName = React.useCallback(
    (name: string) => {
      const label = (name || "").trim();
      if (!label) return;
      upsertCategory({ name: label });
    },
    [upsertCategory]
  );

  const value = React.useMemo<CtxShape>(
    () => ({
      categories,
      setAll,
      setCategories,
      ensureExistsByName,
      findBySlug,
      findByNameCI,
      upsertCategory,
    }),
    [categories, setAll, findBySlug, findByNameCI, upsertCategory]
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
