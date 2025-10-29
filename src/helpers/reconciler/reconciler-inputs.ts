import { StatementSnapshot, upsertStatement } from "@/lib/statements";
import { TxRow } from "@/lib/types";

// If inputs look fresh/empty or drift wildly from parsed, coerce to parsed
export function maybeAutoFixInputs(
  snap: StatementSnapshot,
  txs: TxRow[],
  onFixed: (next: StatementSnapshot) => void
) {
  const { deposits: depParsed, withdrawals: wdlParsed } =
    computeParsedTotals(txs);
  const depUser = +(snap.inputs?.totalDeposits ?? 0);
  const wdlUser = +(snap.inputs?.totalWithdrawals ?? 0);

  const looksFresh = depUser === 0 && wdlUser === 0;
  const depDrift = depUser > 0 ? Math.abs(depUser - depParsed) / depUser : 1;
  const wdlDrift = wdlUser > 0 ? Math.abs(wdlUser - wdlParsed) / wdlUser : 1;

  // Heuristics: auto-fix if new/empty, or >40% drift (catches YTD/typo cases)
  const shouldFix = looksFresh || depDrift > 0.4 || wdlDrift > 0.4;
  if (!shouldFix) return;

  const next: StatementSnapshot = {
    ...snap,
    inputs: {
      ...(snap.inputs ?? {}),
      totalDeposits: depParsed,
      totalWithdrawals: wdlParsed,
      // keep existing beginningBalance if present
      beginningBalance: +(snap.inputs?.beginningBalance ?? 0),
    },
  };
  upsertStatement(next);
  onFixed(next);
}

// Compute monthly totals from current tx list
export function computeParsedTotals(txs: TxRow[]) {
  const dep = +txs
    .filter((t) => (t.amount ?? 0) > 0)
    .reduce((s, t) => s + (t.amount ?? 0), 0)
    .toFixed(2);
  const wdl = +txs
    .filter((t) => (t.amount ?? 0) < 0)
    .reduce((s, t) => s + Math.abs(t.amount ?? 0), 0)
    .toFixed(2);
  return { deposits: dep, withdrawals: wdl };
}
