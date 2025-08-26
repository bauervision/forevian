// app/demo/slug-helpers.ts
"use client";

import { DEMO_MONTHS } from "@/app/demo/data";
import { catToSlug } from "@/lib/slug";

/**
 * Known slugs are those present in the static demo data.
 * New, user-created slugs (e.g. "starbucks") won't be in this set,
 * so we route them via query param (?slug=...) to avoid 404 on SSG.
 */
const KNOWN = new Set<string>();
for (const m of DEMO_MONTHS) {
  for (const t of m.cachedTx ?? []) {
    const leaf = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
    KNOWN.add(catToSlug(leaf));
  }
}

export function demoCategoryHref(slug: string, statement?: string) {
  const path = KNOWN.has(slug)
    ? `/demo/dashboard/category/${encodeURIComponent(slug)}`
    : `/demo/dashboard/category?slug=${encodeURIComponent(slug)}`;

  return statement
    ? `${path}${path.includes("?") ? "&" : "?"}statement=${encodeURIComponent(
        statement
      )}`
    : path;
}
