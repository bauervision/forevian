// /lib/aliases.ts
import { stripAuthAndCard } from "./txEnrich";

if (typeof window !== "undefined")
  (window as any).__FOREVIAN_ALIASES_VER__ = "aliases-2025-09-10a";

export type AliasRule = {
  id: string; // stable id
  pattern: string; // what to match (lowercased)
  label: string; // merchant label to apply
  mode: "contains" | "startsWith" | "regex";
};

const LS = "reconciler.aliases.v1";

export function readAliases(): AliasRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
export function writeAliases(rules: AliasRule[]) {
  try {
    localStorage.setItem(LS, JSON.stringify(rules));
  } catch {}
}

export function applyAlias(desc: string): string | null {
  const rules = readAliases();
  const hay = stripAuthAndCard(desc).toLowerCase();
  for (const r of rules) {
    try {
      if (r.mode === "contains" && hay.includes(r.pattern)) return r.label;
      if (r.mode === "startsWith" && hay.startsWith(r.pattern)) return r.label;
      if (r.mode === "regex") {
        const re = new RegExp(r.pattern, "i");
        if (re.test(hay)) return r.label;
      }
    } catch {}
  }
  return null;
}

// Handy id
const mkId = () => Math.random().toString(36).slice(2, 9);

// Seed with common mappings (only add if not already present)
export function seedCommonAliases() {
  const seeds: Omit<AliasRule, "id">[] = [
    { pattern: "harris te", label: "Harris Teeter", mode: "contains" },
    { pattern: "food lion", label: "Food Lion", mode: "contains" },
    { pattern: "home depot", label: "Home Depot", mode: "contains" },
    { pattern: "target", label: "Target", mode: "contains" },
    { pattern: "amazon", label: "Amazon", mode: "contains" },
    { pattern: "amzn.com/bill", label: "Amazon", mode: "contains" },
    { pattern: "prime video", label: "Amazon", mode: "contains" },
    { pattern: "t-mobile", label: "T-Mobile", mode: "contains" },
    { pattern: "cox comm", label: "Cox Communications", mode: "contains" },
    { pattern: "dominion energy", label: "Dominion Energy", mode: "contains" },
    {
      pattern: "virginia natural gas",
      label: "Virginia Natural Gas",
      mode: "contains",
    },
    {
      pattern: "progressive",
      label: "Progressive Insurance",
      mode: "contains",
    },
    { pattern: "pac life", label: "Pacific Life Insurance", mode: "contains" },
    { pattern: "hp instant ink", label: "HP Instant Ink", mode: "contains" },
    { pattern: "apple.com/bill", label: "Apple.com/Bill", mode: "contains" },
    { pattern: "adobe", label: "Adobe", mode: "contains" },
    { pattern: "buzzsprout", label: "Buzzsprout", mode: "contains" },
    { pattern: "discovery+", label: "Discovery+", mode: "contains" },
    { pattern: "netflix", label: "Netflix", mode: "contains" },
    { pattern: "school of rock", label: "School of Rock", mode: "contains" },
    { pattern: "butcher's son", label: "The Butcher's Son", mode: "contains" },
    { pattern: "butchers son", label: "The Butcher's Son", mode: "contains" },
    { pattern: "chick-fil-a", label: "Chick-fil-A", mode: "contains" },
    { pattern: "cinema cafe", label: "Cinema Cafe", mode: "contains" },
    { pattern: "shell ", label: "Fuel Station", mode: "contains" },
    { pattern: "exxon", label: "Fuel Station", mode: "contains" },
    { pattern: "circle k", label: "Fuel Station", mode: "contains" },
    { pattern: " 7-eleven", label: "Fuel Station", mode: "contains" },
    { pattern: "chevron", label: "Fuel Station", mode: "contains" },
    { pattern: "bp#", label: "Fuel Station", mode: "contains" },
    { pattern: "starbucks", label: "Starbucks", mode: "contains" },
  ];
  const cur = readAliases();
  const has = (p: string, m: AliasRule["mode"], l: string) =>
    cur.some((r) => r.pattern === p && r.mode === m && r.label === l);

  const next = [...cur];
  for (const s of seeds)
    if (!has(s.pattern, s.mode, s.label)) next.push({ id: mkId(), ...s });
  writeAliases(next);
  return next;
}

// Learn aliases from current transactions: frequent vendor tokens
export function learnAliasesFromTransactions(rows: { description: string }[]) {
  const base = readAliases();
  const freq = new Map<string, number>();

  for (const r of rows) {
    const d = stripAuthAndCard(r.description).toLowerCase();
    // cheap vendor tokens
    const m = d.match(/([a-z][a-z\s]{2,})/g);
    if (!m) continue;
    const s = d
      .replace(/#\s*\d+/g, " ")
      .replace(/card\s*\d{4}/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const toks = s.split(" ").filter((x) => x.length > 2);
    if (!toks.length) continue;
    const phrase = toks.slice(0, 2).join(" ");
    freq.set(phrase, (freq.get(phrase) || 0) + 1);
  }

  const suggestions = [...freq.entries()]
    .filter(([, n]) => n >= 2) // seen at least twice
    .map(([phrase]) => phrase);

  const next = [...base];
  for (const ph of suggestions) {
    const pat = ph;
    const label = ph.replace(/\b\w/g, (c) => c.toUpperCase()); // Title Case-ish
    if (!next.some((r) => r.pattern === pat && r.mode === "contains")) {
      next.push({ id: mkId(), pattern: pat, label, mode: "contains" });
    }
  }
  writeAliases(next);
  return next;
}
