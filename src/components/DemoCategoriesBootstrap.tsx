// app/demo/providers/DemoCategoriesBootstrap.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useCategories } from "@/app/providers/CategoriesProvider";
import { DEMO_MONTHS, DEMO_VERSION } from "@/app/demo/data";

/** Build the baseline set of categories from the demo transactions */
function deriveDemoCategories(): string[] {
  const set = new Set<string>();
  for (const m of DEMO_MONTHS) {
    for (const t of m.cachedTx ?? []) {
      const c = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
      if (c) set.add(c);
    }
  }
  // guarantee a couple of anchors
  set.add("Uncategorized");
  return Array.from(set);
}

/** Small helper for stable comparison */
function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * DEMO bootstrap that:
 * - Runs only on /demo routes
 * - Merges baseline demo categories into whatever the user already has
 * - NEVER removes user categories
 * - Only updates if something actually changes
 * - Adds a lightweight versioned hash so future demo updates union-in new cats
 */
export default function DemoCategoriesBootstrap() {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  const { categories = [], setAll, setCategories } = useCategories() as any;

  React.useEffect(() => {
    if (!isDemo) return;

    // 1) compute baseline + a simple “versioned” hash
    const baseline = deriveDemoCategories();
    const baselineKey = "demo.cats.hash.v1";
    const baselineHash = `v${DEMO_VERSION}:${baseline.join("|")}`;

    // 2) if we’ve already merged for this exact baseline, do nothing —
    //    BUT still protect user categories by not overwriting.
    const stored = (() => {
      try {
        return localStorage.getItem(baselineKey);
      } catch {
        return null;
      }
    })();

    // 3) Always MERGE, never replace. User list first, then add any missing baseline items.
    const lower = new Set(
      (categories || []).map((c: string) => c.toLowerCase())
    );
    const merged = [
      ...categories,
      ...baseline.filter((c) => !lower.has(c.toLowerCase())),
    ];

    // 4) Only commit if something changed (or if this is a new baseline)
    const changed = !arraysEqual(merged, categories) || stored !== baselineHash;

    if (changed) {
      if (typeof setAll === "function") setAll(merged);
      else if (typeof setCategories === "function") setCategories(merged);
      try {
        localStorage.setItem(baselineKey, baselineHash);
      } catch {}
    }
    // Intentionally *not* depending on `categories` to avoid loops.
    // We only want to run on route entry or when the demo version/baseline changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  return null;
}
