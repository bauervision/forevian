// /lib/overrides.ts
const LS_KEY = "txCategoryOverrides.v1";

export type CatOverrideMap = Record<string, string>; // key -> category

export function keyForTx(date: string, description: string, amount: number) {
  return `${date}|${description}|${amount.toFixed(2)}`;
}

export function readOverrides(): CatOverrideMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const m = JSON.parse(raw);
    return typeof m === "object" && m ? (m as CatOverrideMap) : {};
  } catch {
    return {};
  }
}

export function writeOverride(k: string, category: string) {
  const m = readOverrides();
  m[k] = category;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {}
}
