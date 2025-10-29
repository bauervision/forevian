/** High-signal phrase keys to disambiguate brands that collide via short tokens */
export function buildDisambiguatorPhrases(
  desc: string,
  alias: string
): string[] {
  const out: string[] = [];
  const d = desc || "";
  const a = alias || "";

  // Club Pilates (exact merchant phrase)
  if (/\bclub\s*pilates\b/i.test(d) || /\bclub\s*pilates\b/i.test(a)) {
    out.push("str:club pilates");
  }

  // BP fuel transactions often appear as "BP#12345 ..." (gas station)
  if (/\bbp\s*#\s*\d+/i.test(d) || /\bbp\s*#\s*\d+/i.test(a)) {
    out.push("str:bp#"); // very specific; won't match "club pilates"
  }

  // Optional: if you want extra guardrails for banks (helps other cases too)
  if (/\bcapital\s+one\b/i.test(d) || /\bcapital\s+one\b/i.test(a)) {
    out.push("str:capital one");
  }
  if (/\bwells\s+fargo\b/i.test(d) || /\bwells\s+fargo\b/i.test(a)) {
    out.push("str:wells fargo");
  }

  // de-dupe & cap
  return Array.from(new Set(out)).slice(0, 8);
}
