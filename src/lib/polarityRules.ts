// /lib/polarityRules.ts
// Lightweight, durable polarity rules (credit/debit) per user/profile.
// Storage: localStorage, versioned. API mirrors your category rules style.

export type PolarityRule = {
  pattern: string; // regex source (no slashes), case-insensitive
  as: "deposit" | "withdrawal"; // desired sign
  addedAt?: number; // epoch ms for housekeeping
};

type RuleMap = Record<string, PolarityRule[]>; // scopedKey -> rules[]

const LS_KEY = "forevian.polarityRules.v1";

// ----- util storage -----
function loadAll(): RuleMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RuleMap;
  } catch {
    return {};
  }
}

function saveAll(map: RuleMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

// Scoping helper — pass a stable key for the user/profile.
// If you don't have one yet, pass "default".
function scope(map: RuleMap, scopedKey: string) {
  if (!map[scopedKey]) map[scopedKey] = [];
  return map[scopedKey];
}

// ----- public API -----

export function readPolarityRules(scopedKey = "default"): PolarityRule[] {
  const all = loadAll();
  return scope(all, scopedKey).slice();
}

export function upsertPolarityRule(
  rule: PolarityRule,
  scopedKey = "default"
): PolarityRule[] {
  const all = loadAll();
  const bucket = scope(all, scopedKey);
  const exists = bucket.find(
    (r) => r.pattern === rule.pattern && r.as === rule.as
  );
  if (!exists) {
    bucket.push({ ...rule, addedAt: Date.now() });
    saveAll(all);
  }
  return bucket.slice();
}

export function removePolarityRule(
  index: number,
  scopedKey = "default"
): PolarityRule[] {
  const all = loadAll();
  const bucket = scope(all, scopedKey);
  if (index >= 0 && index < bucket.length) {
    bucket.splice(index, 1);
    saveAll(all);
  }
  return bucket.slice();
}

export function clearPolarityRules(scopedKey = "default") {
  const all = loadAll();
  all[scopedKey] = [];
  saveAll(all);
}

export function applyPolarityRulesTo<
  T extends { description?: string; amount?: number }
>(rules: PolarityRule[], txs: T[]): T[] {
  return txs.map((t) => {
    let amt = t.amount ?? 0;
    const desc = t.description || "";
    for (const r of rules) {
      try {
        const rx = new RegExp(r.pattern, "i");
        if (rx.test(desc)) {
          if (r.as === "deposit" && amt < 0) amt = Math.abs(amt);
          if (r.as === "withdrawal" && amt > 0) amt = -Math.abs(amt);
        }
      } catch {
        // ignore bad regex
      }
    }
    return { ...t, amount: amt };
  });
}

// ----- helpers to generate robust patterns from descriptors -----

export function suggestTokens(desc: string): string[] {
  const words = desc
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .split(" ")
    .filter((w) => w && !/^\d+$/.test(w));
  const keepers = [
    "PAYPAL",
    "TRANSFER",
    "VAC",
    "VACP",
    "TREAS",
    "WT",
    "FED",
    "WIRE",
    "CAPITAL",
    "ONE",
    "PURCHASE",
    "RETURN",
    "AUTHORIZED",
    "EDEPOSIT",
    "DEPOSIT",
    "PAYING",
    "AGENT",
    "HOLDINGPMT",
    "REFUND",
    "INTEREST",
    "ACH",
    "CREDIT",
    "BRANCH",
    "COMPENSATION",
  ];
  const sig = words.filter((w) => keepers.includes(w));
  return sig.length ? sig.slice(0, 3) : words.slice(0, 3);
}

// Build a tolerant AND-regex: (?=.*\bTOKEN\b)(?=.*\bTOKEN2\b).*
// keeps it resilient to IDs, refs, timestamps in between tokens.
export function makePatternFromDesc(desc: string): string {
  const toks = suggestTokens(desc);
  if (!toks.length) return ".*";
  return toks.map((t) => `(?=.*\\b${t}\\b)`).join("") + ".*";
}
