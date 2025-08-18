import fs from "node:fs";

const FILE = "./forevian_seed_transactions_v4_blocks.json";
const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));

const EXP_DELTA = 53.0; // your current Expense Δ
const EPS = 0.01;

// 0) Basic tallies
const income = rows
  .filter((r) => r.amount > 0)
  .reduce((s, r) => s + r.amount, 0);
const expense = rows
  .filter((r) => r.amount < 0)
  .reduce((s, r) => s - Math.min(r.amount, 0), 0);
console.log(
  "Rows:",
  rows.length,
  "Income:",
  income.toFixed(2),
  "Expense:",
  expense.toFixed(2)
);

// 1) Any SINGLE expense ~= $53?
const singles = rows.filter(
  (r) => r.amount < 0 && Math.abs(Math.abs(r.amount) - EXP_DELTA) < EPS
);
console.log("\nSingles ~= $53:", singles.length);
singles.forEach((r) => console.log(r.date, r.amount.toFixed(2), r.description));

// 2) Deposit-like descriptors that are NEGATIVE (these would inflate expense)
const DEPOSIT_STRONG =
  /\b(ibm\s*3141\s*payroll|leidos\s+inc\s+payroll|pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|mobile\s*deposit|branch\s*deposit|check\s*deposit|zelle\s*(from|credit)|online\s*transfer\s*from|xfer\s*from|ach\s*credit|credit\s+interest|interest\s+(payment|credit)|refund|reversal|return|vacp\s*treas|irs\s*treas|ssa)\b/i;
const negDeposits = rows.filter(
  (r) => r.amount < 0 && DEPOSIT_STRONG.test(r.description)
);
console.log("\nNegative rows that LOOK LIKE deposits:", negDeposits.length);
negDeposits.forEach((r) =>
  console.log(r.date, r.amount.toFixed(2), r.description)
);

// 3) “Purchase Return authorized on …” that are NEGATIVE (should be positive)
const negReturns = rows.filter(
  (r) =>
    r.amount < 0 &&
    /^\s*Purchase\s+Return\s+authorized\s+on\b/i.test(r.description)
);
console.log("\nNegative 'Purchase Return' rows:", negReturns.length);
negReturns.forEach((r) =>
  console.log(r.date, r.amount.toFixed(2), r.description)
);

// 4) Search PAIRS across ALL expenses that sum to ~$53
const expenses = rows
  .filter((r) => r.amount < 0)
  .map((r, i) => ({
    i,
    date: r.date,
    amt: Math.abs(r.amount),
    desc: r.description,
  }));
let pairHits = 0;
for (let i = 0; i < expenses.length; i++) {
  for (let j = i + 1; j < expenses.length; j++) {
    const s = +(expenses[i].amt + expenses[j].amt).toFixed(2);
    if (Math.abs(s - EXP_DELTA) < EPS) {
      if (pairHits++ === 0) console.log("\nPair ~= $53:");
      console.log(
        expenses[i].date,
        `-$${expenses[i].amt.toFixed(2)}`,
        expenses[i].desc,
        "\n",
        expenses[j].date,
        `-$${expenses[j].amt.toFixed(2)}`,
        expenses[j].desc
      );
    }
  }
}
if (pairHits === 0) console.log("\nNo pair match for ~$53.");

// 5) Search TRIPLES among the 120 smallest expenses (keeps it fast) that sum to ~$53
const small = expenses
  .slice()
  .sort((a, b) => a.amt - b.amt)
  .slice(0, 120);
let tripleHit = false;
outer: for (let a = 0; a < small.length; a++) {
  for (let b = a + 1; b < small.length; b++) {
    for (let c = b + 1; c < small.length; c++) {
      const s = +(small[a].amt + small[b].amt + small[c].amt).toFixed(2);
      if (Math.abs(s - EXP_DELTA) < EPS) {
        console.log("\nTriple ~= $53:");
        console.log(
          small[a].date,
          `-$${small[a].amt.toFixed(2)}`,
          small[a].desc
        );
        console.log(
          small[b].date,
          `-$${small[b].amt.toFixed(2)}`,
          small[b].desc
        );
        console.log(
          small[c].date,
          `-$${small[c].amt.toFixed(2)}`,
          small[c].desc
        );
        tripleHit = true;
        break outer;
      }
    }
  }
}
if (!tripleHit) console.log("\nNo triple match among 120 smallest.");

// 6) Show expenses in the neighborhood of $53 (useful for eyeballing)
const near = rows.filter(
  (r) => r.amount < 0 && Math.abs(Math.abs(r.amount) - EXP_DELTA) < 1.0
);
console.log("\nExpenses near $53 (+/- $1):", near.length);
near.forEach((r) => console.log(r.date, r.amount.toFixed(2), r.description));
