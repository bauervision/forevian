// lib/import/flatten.ts
import { normalizePageText } from "@/lib/textNormalizer";
import { collapseBlocks } from "@/lib/import/block";

/** Collapse a pasted multi-line example into one normalized line. */
export function flattenSample(text: string): string {
  if (!text) return "";
  // Grab the first “content block” like your reconciler does,
  // then normalize, then smash to a single line.
  const blocks = collapseBlocks(text);
  const first = blocks.map((b) => b.trim()).find(Boolean) || "";
  const normalized = normalizePageText(first);
  return normalized
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}
