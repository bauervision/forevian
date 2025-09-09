// lib/categoryRules/seed.ts
import { upsertCategoryRules, readCatRules } from "@/lib/categoryRules";

/**
 * A compact, idempotent baseline for out-of-the-box categories.
 * We use phrase rules ("str:...") for brand names to avoid generic token collisions.
 * Safe to call many times; it only upserts/merges.
 */
const SEED_VERSION = "catrules-seed-v3-2025-09-08";

type SeedRow = {
  keys: string[]; // "str:..." or "tok:..."
  label: string; // category name to apply
  kind?: "token" | "alias" | "merchant"; // default inferred by keys; we pass through to upsert
};

// Starbucks (dedicated vendor bucket)
const STARBUCKS: SeedRow = {
  keys: [
    "str:starbucks",
    "str:starbucks store",
    "str:starbucks card",
    "str:sbux",
    "str:sbx",
  ],
  label: "Starbucks",
};

// Fast food majors (quick serve only)
const FAST_FOOD: SeedRow[] = [
  { keys: ["str:mcdonald", "str:mc donald"], label: "Fast Food" },
  { keys: ["str:burger king", "str:bk #"], label: "Fast Food" },
  { keys: ["str:chick-fil-a", "str:chick fil a"], label: "Fast Food" },
  { keys: ["str:wendy"], label: "Fast Food" },
  { keys: ["str:sonic"], label: "Fast Food" },
  { keys: ["str:taco bell"], label: "Fast Food" },
  { keys: ["str:kfc", "str:kentucky fried"], label: "Fast Food" },
  { keys: ["str:subway"], label: "Fast Food" },
  { keys: ["str:five guys", "str:5 guys", "str:5guys"], label: "Fast Food" },
  { keys: ["str:panda express"], label: "Fast Food" },
  { keys: ["str:arby"], label: "Fast Food" },
  { keys: ["str:chipotle"], label: "Fast Food" },
  { keys: ["str:panera"], label: "Fast Food" },
  { keys: ["str:bojangles"], label: "Fast Food" },
  { keys: ["str:little caesars", "str:little caesar"], label: "Fast Food" },
  { keys: ["str:pizza hut"], label: "Fast Food" },
  { keys: ["str:domino", "str:domino's"], label: "Fast Food" },
  { keys: ["str:papa john"], label: "Fast Food" },
  { keys: ["str:popeyes"], label: "Fast Food" },
  { keys: ["str:jimmy john"], label: "Fast Food" },
  { keys: ["str:jersey mike"], label: "Fast Food" },
  { keys: ["str:culver"], label: "Fast Food" },
  { keys: ["str:whataburger"], label: "Fast Food" },
  { keys: ["str:in-n-out", "str:in n out", "str:innout"], label: "Fast Food" },
  { keys: ["str:shake shack"], label: "Fast Food" },
  { keys: ["str:dairy queen", "str:dq "], label: "Fast Food" },
  { keys: ["str:zaxby"], label: "Fast Food" },
  { keys: ["str:qdoba"], label: "Fast Food" },
  { keys: ["str:del taco"], label: "Fast Food" },
  { keys: ["str:el pollo loco"], label: "Fast Food" },
  { keys: ["str:wingstop"], label: "Fast Food" },
  { keys: ["str:checkers", "str:rally's", "str:rallys"], label: "Fast Food" },
  { keys: ["str:raising cane", "str:canes"], label: "Fast Food" },
  { keys: ["str:church's chicken", "str:churchs chicken"], label: "Fast Food" },
  { keys: ["str:freddy's", "str:freddys"], label: "Fast Food" },
];

// A few common non-food anchors (most of these were already “working”, but seeding helps first run)
const NON_FOOD: SeedRow[] = [
  { keys: ["str:target"], label: "Shopping" },
  { keys: ["str:walmart"], label: "Shopping" },
  { keys: ["str:best buy"], label: "Shopping" },
  { keys: ["str:amazon", "str:amzn"], label: "Amazon" },
  {
    keys: [
      "str:bp#",
      "str:shell",
      "str:exxon",
      "str:chevron",
      "str:sunoco",
      "str:wawa",
      "str:pilot",
      "str:7-eleven",
      "str:7 eleven",
    ],
    label: "Fuel",
  },
];

const SEED: SeedRow[] = [STARBUCKS, ...FAST_FOOD, ...NON_FOOD];

/**
 * Ensure a small baseline of brand rules exist. Idempotent and versioned.
 * Call this during:
 *  - Importer open (before parsing)
 *  - Reconciler bootstrap (before applying rules)
 */
export function ensureCategoryRulesSeededOnce() {
  if (typeof window === "undefined") return;

  const markKey = "forevian.catrules.seed.version";
  const seen = localStorage.getItem(markKey);

  // If user already has any rules, we still re-upsert this small set (it merges).
  // Only skip if same seed version already applied.
  if (seen === SEED_VERSION) return;

  // Trigger a read to hydrate any in-memory caches (if your store uses them)
  readCatRules();

  for (const row of SEED) {
    const isAllTokens = row.keys.every((k) => k.startsWith("tok:"));

    if (row.kind) {
      // Explicit kind wins
      upsertCategoryRules(row.keys, row.label, row.kind);
    } else if (isAllTokens) {
      // Token keys → pass "token"
      upsertCategoryRules(row.keys, row.label, "token");
    } else {
      // Phrase/keyword rules → omit the 3rd arg
      upsertCategoryRules(row.keys, row.label);
    }
  }

  try {
    localStorage.setItem(markKey, SEED_VERSION);
  } catch {
    // ignore quota errors
  }
}
