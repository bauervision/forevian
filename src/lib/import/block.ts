// lib/import/block.ts
export function collapseBlocks(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let cur: string[] = [];

  const isAmountOnly = (s: string) =>
    /^\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*$/.test(s);

  for (const l of lines) {
    if (isAmountOnly(l) && cur.length) {
      // attach amount-only to current block
      cur.push(l);
      blocks.push(cur.join(" "));
      cur = [];
    } else {
      // if current already looks “complete”, start a new block
      // heuristic: current already had an amount
      const joined = cur.join(" ");
      if (/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?(\s|$)/.test(joined)) {
        blocks.push(joined);
        cur = [l];
      } else {
        cur.push(l);
      }
    }
  }
  if (cur.length) blocks.push(cur.join(" "));
  return blocks;
}
