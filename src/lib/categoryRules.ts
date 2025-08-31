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

  const raw = String(desc || "");
  const lower = raw.toLowerCase();

  // --------- 1) alias key if we have a resolved label (strongest) ----------
  if (aliasLabel && aliasLabel.trim()) {
    keys.push(`alias:${aliasLabel.trim().toLowerCase()}`);
  }

  // --------- 2) specific banking/payment patterns (strong) -----------------
  // Prefer these before any generic tokens so "online pmt" ≠ "transfer"
  const bankKeys = specificBankingKeys(lower);
  keys.push(...bankKeys);

  // --------- 3) token keys (phrase → unigram fallback) ---------------------
  // Use normalized tokens (stopwords removed) so we don't emit tok:capital_one
  const toks = normalizeTokens(raw);
  const phrase2 = vendorPhrase(toks); // e.g., "home_depot", "prime_video"
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

// --- stopwords + normalizer ---
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
  "online", // kept as stopword for generic tokens; we add a specific key separately
  "xfer",
  "epay",
  "thank",
  "you",
  // bank-brand generics that created over-broad keys:
  "capital",
  "one",

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

// Reward-like categories we should NEVER apply to expenses (negatives)
const REWARD_CATS = new Set(["cash back", "cashback", "rewards", "points"]);

// Generic, too-broad unigrams we won't keep as rules
const BAD_UNIGRAMS = new Set([
  "cash",
  "back",
  "cashback",
  "reward",
  "rewards",
  "points",
  "bonus",
  "credit",
  "debit",
  "purchase",
  "payment",
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

// --- Specific banking/payment detectors (return ordered strong keys) -------
function specificBankingKeys(lowerDesc: string): string[] {
  const out: string[] = [];
  // Online Payment (multiple phrasings to a single strong token)
  if (/\bonline\s+(?:pmt|payment|pymt)\b/.test(lowerDesc)) {
    out.push("tok:online_pmt");
  }
  // Balance Transfer
  if (/\bbalance\s+transfer\b/.test(lowerDesc)) {
    out.push("tok:balance_transfer");
  }
  // External Transfer
  if (/\bexternal\s+transfer\b/.test(lowerDesc)) {
    out.push("tok:external_transfer");
  }
  // Generic Transfer (keep last so specific keys win)
  if (/\btransfer\b/.test(lowerDesc)) {
    out.push("tok:transfer");
  }
  return out;
}

// --- derive the key we store for a row you changed ---
export function deriveKeyFromDescription(
  desc: string,
  aliasLabel?: string | null
): { key: string; source: CategoryRule["source"] } {
  // 1) Prefer alias if provided
  if (aliasLabel && aliasLabel.trim()) {
    return { key: `alias:${aliasLabel.trim().toLowerCase()}`, source: "alias" };
  }

  const raw = String(desc || "");
  const lower = raw.toLowerCase();

  // 2) Prefer specific banking/payment keys so Online Pmt ≠ Transfer
  const bankKeys = specificBankingKeys(lower);
  if (bankKeys.length) {
    return { key: bankKeys[0], source: "token" };
  }

  // 3) Fall back to normalized vendor phrase
  const toks = normalizeTokens(raw);
  const phrase = vendorPhrase(toks);
  if (phrase && phrase.includes("_")) {
    return { key: `tok:${phrase}`, source: "token" };
  }

  // 4) Finally: unigram fallback if it's not weak
  const unigram = toks[0] ?? "";
  const body = unigram || "misc";
  return { key: `tok:${body}`, source: "token" };
}

// --- prune weak/ambiguous rules (like tok:the) ---
function pruneWeakRules(rules: CategoryRule[]): CategoryRule[] {
  const res: CategoryRule[] = [];
  for (const r of rules) {
    if (!r.key.startsWith("tok:")) {
      res.push(r);
      continue;
    }
    const body = r.key.slice(4);

    // drop empties/stopwords
    if (!body || STOP.has(body)) continue;

    // kill weak unigrams (short or generic reward-y)
    if (!body.includes("_")) {
      if (body.length <= 3) continue;
      if (BAD_UNIGRAMS.has(body)) continue;
    }

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
      if (!hit) continue;

      // ⛔ Don't assign reward-like categories to withdrawals
      if ((r.amount ?? 0) < 0 && REWARD_CATS.has(hit.trim().toLowerCase())) {
        continue; // try next key
      }

      cat = hit;
      break;
    }

    if (cat && r.amount !== 0) {
      if (r.categoryOverride && r.categoryOverride.trim()) return r;
      return { ...r, category: cat } as T;
    }
    return r;
  });
}

function normalizeCategoryTarget(name: string): string {
  const s = (name || "").trim();

  // direct canonical names pass through
  const canon = new Set([
    "Fast Food",
    "Dining",
    "Groceries",
    "Fuel",
    "Home/Utilities",
    "Insurance",
    "Entertainment",
    "Shopping",
    "Amazon",
    "Income/Payroll",
    "Transfer: Savings",
    "Transfer: Investing",
    "Rent/Mortgage",
    "Debt",
    "Impulse/Misc",
    "Doctors",
    "Memberships",
    "Subscriptions",
    "Cash Back",
    "Uncategorized",
  ]);
  if (canon.has(s)) return s;

  // common drift → canonical
  const low = s.toLowerCase();
  if (low === "utilities" || low === "home utilities" || low === "utility")
    return "Home/Utilities";
  if (low === "gas") return "Fuel";
  if (low === "housing" || low === "mortgage" || low === "rent")
    return "Rent/Mortgage";
  if (low === "amazon marketplace" || low === "amazon.com") return "Amazon";
  if (low === "income" || low === "payroll") return "Income/Payroll";
  if (low === "transfers" || low === "transfer") return "Uncategorized"; // users will mark Savings/Investing explicitly

  // vendor-y or off-list labels fall back to Uncategorized instead of polluting the category set
  return "Uncategorized";
}

export function upsertCategoryRules(
  keys: string[],
  category: string,
  source: CategoryRule["source"] = "token"
) {
  if (!keys.length) return;
  const rules = readCatRules(); // already prunes persisted junk

  const safeCategory = normalizeCategoryTarget(category);

  for (const key of keys) {
    if (key.startsWith("tok:")) {
      const body = key.slice(4);
      if (
        !body ||
        STOP.has(body) ||
        (!body.includes("_") && (body.length <= 3 || BAD_UNIGRAMS.has(body)))
      ) {
        continue; // skip writing weak token rule
      }
    }

    const idx = rules.findIndex((r) => r.key === key);
    if (idx >= 0)
      rules[idx] = { ...rules[idx], category: safeCategory, source };
    else rules.push({ key, category: safeCategory, source });
  }
  writeCatRules(rules);
}
