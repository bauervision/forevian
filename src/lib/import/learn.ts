// lib/import/learn.ts
import { ImportProfile, DateFmt, GroupMap } from "./profile";

type Guess = {
  regex: RegExp;
  groups: GroupMap;
  fmt: DateFmt;
  score: number;
};

const DATE_PARTS = [
  { fmt: "MDY", rx: `(?<date>(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{2,4}))` },
  { fmt: "DMY", rx: `(?<date>(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{2,4}))` },
  { fmt: "YMD", rx: `(?<date>(\\d{4})[\\/-](\\d{1,2})[\\/-](\\d{1,2}))` },
] as const;

const AMOUNT_PART = `(?<amount>[-+]?\\$?\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)`;
const LAST4_PART = `(?:.*?(?<last4>\\b\\d{4}\\b))?`; // optional

// description: greedy-ish but stops before trailing amount if present
const DESC_PART = `(?<desc>.+?)`;

function buildCandidates() {
  const out: { rx: RegExp; fmt: DateFmt; map: GroupMap }[] = [];

  // Date (first), Description (greedy-ish), Amount (anywhere later), optional last4
  // We also allow a second date in the description (authorized on 06/25 ...) without breaking the match.
  for (const d of DATE_PARTS) {
    const src = String.raw`^\s*${d.rx}\s+(?<desc>.+?)\s+(?:.*?\s)?(?<amount>[-+]?[$]?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b(?:.*?\b(?<last4>\d{4})\b)?\s*$`;
    const rx = new RegExp(src, "i");
    out.push({
      rx,
      fmt: d.fmt as DateFmt,
      map: { date: 1, description: 2, amount: 3, cardLast4: 4 },
    });
  }
  return out;
}

export function learnFromSamples(lines: string[]): {
  profile: ImportProfile | null;
  matches: Array<{ line: string; ok: boolean; fields?: any }>;
} {
  const candidates = buildCandidates();

  let best: Guess | null = null;
  for (const c of candidates) {
    let hits = 0;
    for (const line of lines) {
      const m = c.rx.exec(line);
      if (!m) continue;
      const desc = m.groups?.desc?.trim();
      const amt = m.groups?.amount?.trim();
      const date = m.groups?.date?.trim();
      if (desc && amt && date) hits++;
    }
    const score = hits / (lines.length || 1);
    if (!best || score > best.score) {
      best = { regex: c.rx, groups: c.map, fmt: c.fmt, score };
    }
  }

  if (!best || best.score < 0.5) {
    return {
      profile: null,
      matches: lines.map((line) => ({ line, ok: false })),
    };
  }

  const unifiedRegex = best.regex.source; // store as source
  const profile: ImportProfile = {
    version: 1,
    unified: true,
    unifiedRegex,
    groups: best.groups,
    dateFmt: best.fmt,
    inferDebitIfNoSign: true,
    preprocess: {
      trimExtraSpaces: true,
      stripPhoneNumbers: true,
      stripLeadingTags: ["SPO*", "TS*", "AMZN*"],
    },
  };

  const matches = lines.map((line) => {
    const m = new RegExp(unifiedRegex, "i").exec(line);
    if (!m) return { line, ok: false };
    const g = m.groups || {};
    return {
      line,
      ok: true,
      fields: {
        date: g.date?.trim(),
        description: g.desc?.trim(),
        amount: g.amount?.trim(),
        last4: g.last4?.trim() || "",
      },
    };
  });

  return { profile, matches };
}
