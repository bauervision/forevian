// /lib/import/amounts.ts
// Robust amount extraction for bank lines.
// Handles: (1) two-column EOL amounts (amount, running balance), (2) single-amount lines (deposits),
// (3) negatives via parentheses or leading '-', (4) weird whitespace incl NBSP and tabs.

const NBSP = "\u00A0";
const THINSP = "\u2009";
const ALL_WS = `[\\s${NBSP}${THINSP}\\t]`;

// money like: $1,234.56  or (123.45)  or -12.34  or 12.34
const MONEY_CORE = String.raw`(?:
  \$? -? \d{1,3}(?:,\d{3})*\.\d{2} |    # 1,234.56 / -1,234.56 / $1,234.56
  \$? -? \d+\.\d{2} |                    # 12.34 / -12.34 / $12.34
  \(\$?\d{1,3}(?:,\d{3})*\.\d{2}\) |     # (1,234.56) / ($1,234.56)
  \(\$?\d+\.\d{2}\)                      # (12.34) / ($12.34)
)`;
const MONEY_RE = new RegExp(
  MONEY_CORE.replace(/\s+#.*$/gm, "").replace(/\s+/g, ""),
  "g"
);

// Two money columns anchored at EOL with flexible whitespace between
const EOL_PAIR_RE = new RegExp(
  `${MONEY_CORE}${ALL_WS}{1,}${MONEY_CORE}${ALL_WS}*$`
    .replace(/\s+#.*$/gm, "")
    .replace(/\s+/g, ""),
  "i"
);

function toNumber(raw: string): number {
  const s = raw.trim();
  // Parentheses negative
  if (/\(.*\)/.test(s)) {
    const inner = s.replace(/[()]/g, "");
    return -toNumber(inner);
  }
  // Remove $ and commas
  const cleaned = s.replace(/\$/g, "").replace(/,/g, "");
  return Number(cleaned);
}

/** Picks the transaction amount from a line, plus optional running balance if present. */
export function pickAmountsFromLine(line: string): {
  amount?: number;
  runningBalance?: number;
  source: "eol-pair" | "single" | "none";
  tokens?: string[]; // instrumentation
} {
  const raw = line
    .replace(/\s+/g, " ")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim();

  // 1) Prefer EOL pair: [amount] [runningBalance]
  const pair = raw.match(EOL_PAIR_RE);
  if (pair) {
    // Get the two last money tokens on the line
    const tokens = Array.from(raw.matchAll(MONEY_RE)).map((m) => m[0]);
    if (tokens.length >= 2) {
      const amt = toNumber(tokens[tokens.length - 2]);
      const bal = toNumber(tokens[tokens.length - 1]);
      return { amount: amt, runningBalance: bal, source: "eol-pair", tokens };
    }
  }

  // 2) Single-amount line (e.g., deposits without trailing balance)
  const tokens = Array.from(raw.matchAll(MONEY_RE)).map((m) => m[0]);

  // Heuristic: if there’s exactly one money token → treat it as the amount
  if (tokens.length === 1) {
    return { amount: toNumber(tokens[0]), source: "single", tokens };
  }

  // If multiple tokens, choose the best candidate:
  // - Prefer a signed-looking token (parentheses or explicit -)
  // - Otherwise pick the smaller magnitude as amount (the larger is often a running balance elsewhere)
  if (tokens.length >= 2) {
    const nums = tokens.map((t) => ({ raw: t, val: toNumber(t) }));
    const signed = nums.find((n) => /[(-]/.test(n.raw));
    if (signed) {
      return { amount: signed.val, source: "single", tokens };
    }
    // pick smaller absolute value
    const sorted = nums
      .slice()
      .sort((a, b) => Math.abs(a.val) - Math.abs(b.val));
    return { amount: sorted[0].val, source: "single", tokens };
  }

  return { source: "none", tokens: [] };
}

/** Dev-only instrumentation; guard with a build-time flag or env var. */
export function debugAmounts(line: string, enabled = false) {
  if (!enabled) return;
  const { amount, runningBalance, source, tokens } = pickAmountsFromLine(line);
  // eslint-disable-next-line no-console
  console.log("[import dbg]", { line, amount, runningBalance, source, tokens });
}
