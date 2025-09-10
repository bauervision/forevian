// /lib/categoryRules.ts
import { BRAND_MAP } from "./brands/catalog";
import { inferCategoryFromBrands } from "./brands/matcher";
import { canonicalizeCategoryName } from "./categories/canon";
import { stripAuthAndCard } from "./txEnrich";

if (typeof window !== "undefined")
  (window as any).__FOREVIAN_RULES_VER__ = "rules-2025-09-10i";

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
const REWARD_CATS = new Set(["cashback", "rewards", "points"]);

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

function cashBackEmbeddedAmount(desc: string): number | null {
  // e.g. "with Cash Back $ 20.00 ...", "cash back $20"
  const m = String(desc || "")
    .toLowerCase()
    .match(/\bcash\s*back\b.*?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i);
  if (!m) return null;
  const n = Number((m[1] || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function nearlyEqual(a: number, b: number, cents = 0.01) {
  return Math.abs(a - b) <= cents;
}

// ---------- Minimal auto-categorizer (only used if no rule matches) ----------
function autoInferCategory(desc: string, amount: number): string | undefined {
  const d = (desc || "").toLowerCase();

  // cash back on deposits is fine (withdrawals are handled via embedded-amount logic)
  if (/\bcash\s*back\b/.test(d) && amount >= 0) return "Cash Back";

  // First pass: explicit servicers/brands
  for (const [cat, terms] of Object.entries(BRAND_MAP)) {
    if (cat === "Cash Back" || cat === "Uncategorized") continue;
    // Guard Debt: don’t match on generic bank names alone
    if (cat === "Debt") continue; // handle below with stronger gating
    if (terms.some((t) => d.includes(t))) return canonicalizeCategoryName(cat);
  }

  // Debt (gated): require BOTH a known bank/servicer AND loan/payment context
  const hasDebtServicer =
    /\b(navient|nelnet|aidvantage|mohela|great lakes|sallie mae|sofi|lendingclub|upstart|marcus|prosper|best egg|one\s*main|cardmember services|auto finance)\b/.test(
      d
    ) ||
    /\b(chase|capital one|truist)\b.*\b(auto finance|loan|card payment|payment|pmt|installment)\b/.test(
      d
    );
  if (hasDebtServicer) return "Debt";

  // Generic helpers (kept conservative)
  if (/\b(zelle|venmo|paypal)\b/.test(d)) return "Uncategorized";

  return undefined;
}

// Preserve row shape (e.g., Transaction) using a generic:
export function applyCategoryRulesTo<T extends TxLike>(
  rules: CategoryRule[],
  rows: T[],
  aliasFn?: (s: string) => string | null
): T[] {
  if (!rules.length) return rows;

  // 1) Build quick lookups
  const map = new Map(
    rules
      .filter((r) => r.key.startsWith("alias:") || r.key.startsWith("tok:"))
      .map((r) => [r.key, r.category])
  );

  // 2) Phrase rules (str:) – small list, so linear scan is fine
  const phraseRules = rules
    .filter((r) => r.key.startsWith("str:"))
    .map((r) => ({ term: r.key.slice(4).toLowerCase(), category: r.category }))
    .filter((pr) => pr.term.length >= 2);

  // helpers
  const normDesc = (s: string) =>
    stripAuthAndCard(String(s || "")).toLowerCase();

  return rows.map((r) => {
    const amt = r.amount ?? 0;
    const desc = r.description || "";

    // --- Cash Back precedence (keep your working logic here) ---
    const embedded = cashBackEmbeddedAmount(desc);
    if (embedded != null && Math.abs(amt) - embedded <= 0.01) {
      // force this row to Cash Back regardless of other rules
      return {
        ...r,
        category: "Cash Back",
        categoryOverride: r.categoryOverride ?? "Cash Back",
      } as T;
    }

    // --- Respect explicit override if present ---
    if (r.categoryOverride && r.categoryOverride.trim()) return r;

    let cat: string | undefined;

    // 3) alias/tok map match using candidateKeys
    {
      const alias = aliasFn ? aliasFn(stripAuthAndCard(desc)) : null;
      const keys = candidateKeys(desc, alias);
      for (const k of keys) {
        const hit = map.get(k);
        if (!hit) continue;
        // block points-ish on negatives, but allow Cash Back
        if (amt < 0 && /^(cashback|rewards|points)$/i.test(hit.trim()))
          continue;
        cat = hit;
        break;
      }
    }

    // 4) phrase rules (str:) – includes() on normalized desc
    if (!cat && phraseRules.length) {
      const nd = normDesc(desc);
      const hit = phraseRules.find((pr) => nd.includes(pr.term));
      if (hit) cat = hit.category;
    }

    // 5) auto-infer fallback (catalog + safeguards)
    if (!cat && amt !== 0) {
      const auto = autoInferCategory(desc, amt);
      if (auto) cat = auto;
    }

    return cat ? ({ ...r, category: cat } as T) : r;
  });
}

// /lib/categoryRules.ts

function normalizeCategoryTarget(name: string): string {
  return canonicalizeCategoryName(name);
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
