import { upsertCategoryRules, readCatRules } from "@/lib/categoryRules";
import { BRAND_MAP } from "@/lib/brands/catalog";
import { CANON_NAMES } from "@/lib/categories/canon";

const SEED_VERSION = "catrules-seed-v10-2025-09-10";

export function ensureCategoryRulesSeededOnce() {
  if (typeof window === "undefined") return;
  const markKey = "forevian.catrules.seed.version";
  if (localStorage.getItem(markKey) === SEED_VERSION) return;

  readCatRules(); // hydrate
  for (const [label, terms] of Object.entries(BRAND_MAP)) {
    if (!CANON_NAMES.has(label)) continue; // guard
    const keys = terms.map((t) => `str:${t}`); // phrase rules (safer than generic tokens)
    if (keys.length) upsertCategoryRules(keys, label); // source inferred by keys
  }
  try {
    localStorage.setItem(markKey, SEED_VERSION);
  } catch {}
}
