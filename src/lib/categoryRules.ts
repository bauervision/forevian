// /lib/categoryRules.ts
import { stripAuthAndCard } from "./txEnrich";

const LS = "reconciler.catRules.v1";

export type CategoryRule = {
  key: string; // matching key, e.g. alias:starbucks  or tok:home_depot
  category: string; // category to apply
  source: "alias" | "merchant" | "token";
};

export function candidateKeys(
  desc: string,
  aliasLabel?: string | null
): string[] {
  const keys: string[] = [];
  // alias key if we have a resolved label
  if (aliasLabel && aliasLabel.trim()) {
    keys.push(`alias:${aliasLabel.trim().toLowerCase()}`);
  }

  // token keys (first 2 meaningful tokens; also single token fallback)
  const toks = normalizeTokens(desc); // already in your file
  const phrase2 = vendorPhrase(toks); // e.g., "chick_fil" or "home_depot"
  if (phrase2) keys.push(`tok:${phrase2}`);
  if (toks[0]) keys.push(`tok:${toks[0]}`); // unigram fallback (less preferred)

  // de-dup while preserving order
  return Array.from(new Set(keys));
}

export function writeCatRules(rules: CategoryRule[]) {
  try {
    localStorage.setItem(LS, JSON.stringify(rules));
  } catch {}
}

// --- NEW: stopwords + normalizer ---
const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "of",
  "on",
  "for",
  "with",
  "to",
  "from",
  "at",
  "in",
  "by",
  "purchase",
  "authorized",
  "recurring",
  "payment",
  "card",
  "www",
  "com",
  "bill",
  "store",
  "retail",
  "services",
  "inc",
  "llc",
  "co",
  "corp",
  "company",
  "online",
  "transfer",
  "xfer",
  "payment",
  "epay",
  "thank",
  "you",
  // common city/state/usps bits we often see
  "va",
  "nc",
  "sc",
  "md",
  "dc",
  "ny",
  "nj",
  "pa",
  "ga",
  "fl",
  "ca",
  "tx",
  "az",
  "nm",
  "oh",
  "mi",
  "wi",
  "il",
  "wa",
  "or",
  "co",
  "ut",
  "al",
  "ar",
  "tn",
  "ky",
  "mo",
  "mn",
  "ia",
  "ks",
  "ne",
  "sd",
  "nd",
  "id",
  "mt",
  "wy",
  "ok",
  "la",
  "ms",
  "wv",
  "nh",
  "vt",
  "me",
  "ma",
  "ct",
  "ri",
  "de",
  "chesapeake",
  "norfolk",
  "virginia",
  "beach",
  "newport",
  "news",
]);

function normalizeTokens(s: string): string[] {
  const cleaned = stripAuthAndCard(s)
    .toLowerCase()
    .replace(/#\s*\d+/g, " ") // drop store numbers like "#4656"
    .replace(/[\d]+/g, " ") // drop numbers
    .replace(/[^a-z\s]/g, " ") // keep letters
    .replace(/\s+/g, " ") // collapse
    .trim();

  return cleaned.split(" ").filter((t) => t && !STOP.has(t) && t.length > 2);
}

// pick the first 2 meaningful tokens, e.g. "home depot" → home_depot; "butchers son" → butchers_son
function vendorPhrase(tokens: string[]): string {
  if (!tokens.length) return "";
  const take = tokens.slice(0, 2);
  return take.join("_");
}

// --- derive the key we store for a row you changed ---
export function deriveKeyFromDescription(
  desc: string,
  aliasLabel?: string | null
): { key: string; source: CategoryRule["source"] } {
  if (aliasLabel && aliasLabel.trim()) {
    return { key: `alias:${aliasLabel.trim().toLowerCase()}`, source: "alias" };
  }
  const toks = normalizeTokens(desc);
  const phrase = vendorPhrase(toks) || (toks[0] ?? "");

  // fallback safety
  const body = phrase || "misc";
  return { key: `tok:${body}`, source: "token" };
}

// --- NEW: prune weak/ambiguous rules (like tok:the) ---
function pruneWeakRules(rules: CategoryRule[]): CategoryRule[] {
  const res: CategoryRule[] = [];
  for (const r of rules) {
    if (!r.key.startsWith("tok:")) {
      res.push(r);
      continue;
    }
    const body = r.key.slice(4);
    if (!body || STOP.has(body)) continue; // drop single stopwords
    // if it's a single token and super short, drop it
    if (!body.includes("_") && body.length <= 3) continue;
    res.push(r);
  }
  return res;
}

export function readCatRules(): CategoryRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || "[]");
    const arr = Array.isArray(raw) ? raw : [];
    const pruned = pruneWeakRules(arr);
    if (pruned.length !== arr.length) writeCatRules(pruned); // persist cleanup once
    return pruned;
  } catch {
    return [];
  }
}

export type TxLike = {
  id: string;
  description: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
};

// Preserve row shape (e.g., Transaction) using a generic:
export function applyCategoryRulesTo<T extends TxLike>(
  rules: CategoryRule[],
  rows: T[],
  aliasFn?: (s: string) => string | null
): T[] {
  if (!rules.length) return rows;
  const map = new Map(rules.map((r) => [r.key, r.category]));

  return rows.map((r) => {
    const alias = aliasFn ? aliasFn(stripAuthAndCard(r.description)) : null;
    const keys = candidateKeys(r.description, alias);
    let cat: string | undefined;
    for (const k of keys) {
      const hit = map.get(k);
      if (hit) {
        cat = hit;
        break;
      }
    }
    if (cat && r.amount !== 0) {
      if (r.categoryOverride && r.categoryOverride.trim()) return r; // respect explicit override
      return { ...r, category: cat } as T;
    }
    return r;
  });
}

export function upsertCategoryRules(
  keys: string[],
  category: string,
  source: CategoryRule["source"] = "token"
) {
  if (!keys.length) return;
  const rules = readCatRules();
  for (const key of keys) {
    const idx = rules.findIndex((r) => r.key === key);
    if (idx >= 0) rules[idx] = { ...rules[idx], category };
    else rules.push({ key, category, source });
  }
  writeCatRules(rules);
}
