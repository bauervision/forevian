import { applyAlias } from "@/lib/aliases";
import { candidateKeys } from "@/lib/categoryRules";
import { stripAuthAndCard } from "@/lib/txEnrich";

/** Tokens we ignore for matching “same merchant” so we don’t over-apply. */
export const GENERIC_TOKENS = new Set([
  "store",
  "market",
  "supermarket",
  "mart",
  "fuel",
  "gas",
  "station",
  "pharmacy",
  "shop",
  "online",
  "purchase",
  "payment",
  "services",
  "service",
  "llc",
  "inc",
  "the",
  // Added to avoid transfer/bank collisions
  "transfer",
  "bank",
  "banking",
  "account",
  "ref",
]);

/** Tokens we *never* want to write rules for (too generic → causes collisions). */
export const RULE_STOP_TOKENS = new Set([
  "transfer",
  "online",
  "bank",
  "banking",
  "account",
  "payment",
  "services",
  "service",
  "ref",
  "transaction",
  "to",
  "from",
]);

export function merchantTokenSet(desc: string) {
  const alias = applyAlias(stripAuthAndCard(desc || ""));
  const keys = candidateKeys(desc || "", alias);
  const toks = new Set<string>();
  for (const k of keys) {
    if (!k.startsWith("tok:")) continue;
    const tok = k.slice(4).toLowerCase();
    if (tok.length <= 3) continue;
    if (GENERIC_TOKENS.has(tok)) continue;
    toks.add(tok);
  }
  return toks;
}

export function anyIntersect(a: Set<string>, b: Set<string>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}
