import { BRAND_MAP } from "./catalog";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// tolerant term → regex: collapse spaces/hyphens
export const termToRegex = (term: string) =>
  new RegExp(`\\b${esc(term).replace(/\s+/g, "[\\s\\-]*")}\\b`, "i");

// Precompile for perf
export const BRAND_REGEX: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(BRAND_MAP).map(([cat, terms]) => [cat, terms.map(termToRegex)])
);

// Headless inference you can call from categoryRules
export function inferCategoryFromBrands(desc: string): string | undefined {
  const s = String(desc || "");
  for (const [cat, regs] of Object.entries(BRAND_REGEX)) {
    if (regs.some((rx) => rx.test(s))) return cat;
  }
  return undefined;
}
