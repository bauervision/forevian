// /lib/textNormalize.ts
const INVIS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g; // bidi/invisible
const NBSP = /\u00A0/g;

export function normalizePageText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(NBSP, " ") // nbsp → space
    .replace(INVIS, "") // strip invisible marks
    .replace(/[–—−]/g, "-") // en/em/minus → hyphen
    .replace(/\t/g, " ") // tabs → space
    .replace(/\r\n?/g, "\n") // CRLF → LF
    .replace(/[^\S\n]+/g, " ") // collapse spaces but keep newlines
    .replace(/[ \t]+\n/g, "\n") // trim right
    .replace(/^\s+|\s+$/g, ""); // trim
}

// Per-line cleanup (useful inside parsers when scanning lines)
export function sanitizeLine(line: string): string {
  return line
    .replace(NBSP, " ")
    .replace(INVIS, "")
    .replace(/[–—−]/g, "-")
    .trim();
}
