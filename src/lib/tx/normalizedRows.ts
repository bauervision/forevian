// /lib/tx/normalizedRows.ts
import { readIndex } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { rebuildFromPages } from "@/lib/import/reconcile";
import { normalizePageText } from "@/lib/textNormalizer";

export type RawRow = {
  id: string;
  date?: string;
  description?: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
};

export function hasData(s?: any) {
  return !!(
    (Array.isArray(s?.cachedTx) && s.cachedTx.length > 0) ||
    (Array.isArray(s?.pagesRaw) && s.pagesRaw.length > 0)
  );
}

export function buildRowsForStatement(id: string): RawRow[] {
  const idx = readIndex();
  const cur = idx[id];
  if (!cur) return [];

  let base: any[] = [];
  if (Array.isArray(cur.cachedTx) && cur.cachedTx.length) {
    base = cur.cachedTx;
  } else if (Array.isArray(cur.pagesRaw) && cur.pagesRaw.length) {
    const sanitized = cur.pagesRaw.map(normalizePageText);
    const res = rebuildFromPages(sanitized, cur.stmtYear, applyAlias);
    base = res.txs;
  }

  const rules = readCatRules();
  return applyCategoryRulesTo(rules, base, applyAlias) as RawRow[];
}

export function buildRowsYTD(anchorId: string): RawRow[] {
  const idx = readIndex();
  const cur = idx[anchorId];
  if (!cur) return [];
  const rules = readCatRules();

  const rows: any[] = [];
  const sameYear = Object.values(idx).filter(
    (s: any) => s?.stmtYear === cur.stmtYear && s?.stmtMonth <= cur.stmtMonth
  );
  for (const s of sameYear) {
    let base: any[] = [];
    if (Array.isArray(s.cachedTx) && s.cachedTx.length) base = s.cachedTx;
    else if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
      const sanitized = s.pagesRaw.map(normalizePageText);
      const res = rebuildFromPages(sanitized, s.stmtYear, applyAlias);
      base = res.txs;
    }
    if (base.length) rows.push(...base);
  }
  return applyCategoryRulesTo(rules, rows, applyAlias) as RawRow[];
}

export function prevStatementId(currentId?: string | null) {
  if (!currentId) return null;
  const [y, m] = currentId.split("-").map(Number);
  if (!y || !m) return null;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const cand = `${String(py).padStart(4, "0")}-${String(pm).padStart(2, "0")}`;
  const idx = readIndex();
  return idx[cand] ? cand : null;
}
