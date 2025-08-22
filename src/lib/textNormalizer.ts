// /lib/textNormalize.ts
const INVIS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g; // bidi/invisible
const NBSP = /\u00A0/g;
export const NORMALIZER_VERSION = 2; // bump this whenever normalizePageText logic changes

export function normalizePageText(raw: string): string {
  if (!raw) return "";

  // Your original normalization pipeline
  const s = raw
    .replace(NBSP, " ") // nbsp → space
    .replace(INVIS, "") // strip invisible marks
    .replace(/[–—−]/g, "-") // en/em/minus → hyphen
    .replace(/\t/g, " ") // tabs → space
    .replace(/\r\n?/g, "\n") // CRLF → LF
    .replace(/[^\S\n]+/g, " ") // collapse spaces but keep newlines
    .replace(/[ \t]+\n/g, "\n") // trim right
    .replace(/^\s+|\s+$/g, ""); // trim

  // NEW: per-line pass to drop a trailing running balance if present
  const lines = s.split("\n").map(stripTrailingRunningBalance).filter(Boolean);

  return lines.join("\n");
}
// Per-line cleanup (useful inside parsers when scanning lines)
export function sanitizeLine(line: string): string {
  return line
    .replace(NBSP, " ")
    .replace(INVIS, "")
    .replace(/[–—−]/g, "-")
    .trim();
}

const AMOUNT_SRC = String.raw`[+-]?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})|\((?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})\)`;
const AMOUNT_RX = new RegExp(AMOUNT_SRC, "g");

// NEW: strip a trailing running balance amount if a line contains 2+ amounts
export function stripTrailingRunningBalance(line: string): string {
  if (!line) return line;
  const matches = line.match(AMOUNT_RX);
  if (!matches || matches.length < 2) return line;

  // Remove exactly ONE trailing amount, with optional balance-ish label
  const TRAILING_BAL_RX = new RegExp(
    String.raw`(?:\s+(?:new\s+)?(?:ending|daily|available|current)?\s*bal(?:ance)?(?:\s+as\s+of\s+\d{1,2}\/\d{1,2})?\s*:?)?\s*(?:${AMOUNT_SRC})\s*$`,
    "i"
  );
  return line.replace(TRAILING_BAL_RX, "").trim();
}
