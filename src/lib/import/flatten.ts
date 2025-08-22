// lib/import/flatten.ts
import { normalizePageText } from "@/lib/textNormalizer";
import { collapseBlocks } from "@/lib/import/block";

/** Returns the first normalized non-empty block WITH line breaks (for parsing). */
export function firstBlock(text: string): string {
  if (!text) return "";
  const blocks = collapseBlocks(text);
  const raw = blocks.map((b) => b.trim()).find(Boolean) || "";
  return normalizePageText(raw); // still may contain line breaks
}

/** Returns a single-line preview for UI only. */
export function previewOneLine(blockOrText: string): string {
  if (!blockOrText) return "";
  return blockOrText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}
