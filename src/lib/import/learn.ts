// lib/import/learn.ts

/**
 * Lightweight "learning" module that synthesizes a unified regex able to parse
 * (date, description, amount, last4) from compact, single-line statement rows.
 *
 * It intentionally returns a *draft* profile shape so callers can merge it into
 * their own ImportProfile type (adding required fields like version, groups, etc.)
 */

import type { DateFmt } from "./profile";

export type LearnedProfileDraft = {
  /** Regex source (no leading/trailing slashes). Uses named groups: date, description, amount, last4 */
  unifiedRegex: string;
  /** Human-friendly date format hint the regex expects */
  dateFmt: DateFmt;
};

export type ParsedRow = {
  ok: boolean;
  date?: string;
  description?: string;
  amount?: string;
  last4?: string;
  /** Raw input line used for parsing */
  line: string;
  /** Optional error if not ok */
  error?: string;
};

export type LearnResult = {
  profile: LearnedProfileDraft | null;
  /** Parsed previews for each provided line using the learned regex (when available) */
  matches: ParsedRow[];
};

/* -----------------------------------------
 * Helpers
 * ----------------------------------------- */

/** Compact a multiline paste into a single line (spaces normalized) */
export function compactLine(s: string): string {
  return (s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very forgiving amount fragment: 123.45, 1,234.56, (123.45), +12.34, -9.00 */
const AMOUNT_RX_SRC = String.raw`[+-]?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})|\((?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})\)`;

/**
 * Card fragment variations:
 * - Card 1234
 * - card 1234
 * - Card: 1234
 * - Card# 1234
 * - Card ending in 1234
 * - CARD ****1234
 *
 * For the lookahead we must NOT use a named group. For the real capture we DO.
 */
// For lookahead (NO named capture here)
const CARD_CORE_NO_CAPTURE = String.raw`\bCard(?:\s+ending\s+in|#|:)?\s*(?:\*{0,4})?\s*(?:\d{4})\b`;

// For actual capture (WITH named capture)
const CARD_CORE_WITH_CAPTURE = String.raw`\bCard(?:\s+ending\s+in|#|:)?\s*(?:\*{0,4})?\s*(?<last4>\d{4})\b`;

/** Date is MM/DD or M/D (no year; that’s how most inline tables show it) */
const DATE_RX_SRC = String.raw`\d{1,2}\/\d{1,2}`;

/**
 * Build the unified regex SOURCE (no slashes). It:
 *  - Captures date
 *  - Captures description (EXCLUDING trailing "Card 1234" if present)
 *  - Optionally captures last4
 *  - Captures amount at the end
 *
 * We place a lookahead after description to ensure it stops before the
 * (optional) card chunk and the amount.
 */
function buildUnifiedRegexSource(): string {
  // Lookahead must NOT have named captures
  const lookahead = String.raw`(?=\s+(?:${CARD_CORE_NO_CAPTURE}\s+)?(?:${AMOUNT_RX_SRC}))`;

  const src =
    String.raw`^(?<date>${DATE_RX_SRC})\s+` +
    String.raw`(?<description>.+?)` +
    lookahead +
    String.raw`(?:\s+${CARD_CORE_WITH_CAPTURE})?` +
    // capture the first transaction amount…
    String.raw`\s+(?<amount>${AMOUNT_RX_SRC})` +
    // …then optionally allow ONE extra trailing amount (running balance), ignored
    String.raw`(?:\s+(?:${AMOUNT_RX_SRC}))?` +
    String.raw`\s*$`;

  return src;
}

/** Compile with case-insensitive + unicode by default */
function compile(rxSource: string): RegExp {
  return new RegExp(rxSource, "iu");
}

/** Parse a single compacted line using a unified regex source */
export function parseLine(unifiedRegexSource: string, line: string): ParsedRow {
  const rx = compile(unifiedRegexSource);
  const m = rx.exec(line);
  if (!m || !m.groups) {
    return { ok: false, line, error: "No match" };
  }
  return {
    ok: true,
    line,
    date: m.groups["date"] ?? "",
    description: m.groups["description"] ?? "",
    amount: m.groups["amount"] ?? "",
    last4: m.groups["last4"] ?? "",
  };
}

/* -----------------------------------------
 * Public: learnFromSamples
 * ----------------------------------------- */

/**
 * Learn a robust parser from a couple of representative compact lines.
 * You can pass raw or multiline strings — we compact them here for safety.
 *
 * Returns:
 *  - profile: a draft profile with regex + dateFmt (or null if not confident)
 *  - matches: parsed previews per line using the learned regex
 */
export function learnFromSamples(inputSamples: string[]): LearnResult {
  const samples = (inputSamples || [])
    .map((s) => compactLine(s))
    .filter(Boolean);

  // Require at least one sample; ideally two (withdrawal + deposit)
  if (samples.length === 0) {
    return { profile: null, matches: [] };
  }

  // Build our best unified regex
  const unifiedRegex = buildUnifiedRegexSource();

  // Try parsing the samples
  const matches = samples.map((line) => parseLine(unifiedRegex, line));

  // Confidence: at least one must match, and if multiple, most should match
  const okCount = matches.filter((m) => m.ok).length;
  const confident =
    (samples.length === 1 && okCount === 1) ||
    (samples.length >= 2 && okCount >= Math.ceil(samples.length * 0.8));

  if (!confident) {
    return { profile: null, matches };
  }

  const profile: LearnedProfileDraft = {
    unifiedRegex,
    dateFmt: "MM/DD",
  };

  return { profile, matches };
}

/* -----------------------------------------
 * Optional utilities you might find handy
 * ----------------------------------------- */

/** Quick check utility to see if a single line would match with our pattern */
export function wouldMatch(line: string): boolean {
  const rx = compile(buildUnifiedRegexSource());
  return rx.test(compactLine(line));
}

/** Expose the building blocks in case you want to tweak elsewhere */
export const __internal = {
  AMOUNT_RX_SRC,
  DATE_RX_SRC,
  CARD_CORE_NO_CAPTURE,
  CARD_CORE_WITH_CAPTURE,
  buildUnifiedRegexSource,
  compile,
};
