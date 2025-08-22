// components/ImportStatementWizard.tsx
"use client";

import * as React from "react";
import { useAliases } from "@/app/providers/AliasesProvider";
import { useImportProfile } from "@/lib/import/store";
import {
  readIndex,
  upsertStatement,
  emptyStatement,
  makeId,
  monthLabel,
  type StatementSnapshot,
} from "@/lib/statements";
import { normalizePageText } from "@/lib/textNormalizer";
import { rebuildFromPages } from "@/lib/import/reconcile";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { useSpenders } from "@/lib/spenders";

/* ---------- local UI helpers ---------- */

function last4OrNull(v: any): string | null {
  const s = String(v ?? "")
    .replace(/\D/g, "")
    .slice(-4);
  return /^\d{4}$/.test(s) && s !== "0000" ? s : null;
}

const canon = (l4: string | number) =>
  String(l4 ?? "")
    .replace(/\D/g, "")
    .slice(-4)
    .padStart(4, "0");

function Panel(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;
  return (
    <section
      className={`rounded-2xl border border-slate-700 bg-slate-900 ${className}`}
      {...rest}
    />
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  variant = "default",
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "default" | "danger" | "primary";
  className?: string;
}) {
  const base =
    "inline-flex items-center px-3 py-2 rounded-2xl border text-sm " +
    "bg-slate-900 border-slate-700 hover:bg-slate-800 " +
    "focus:outline-none focus:ring-2 focus:ring-emerald-500/60 " +
    "disabled:opacity-50 whitespace-normal break-words text-left";
  const danger =
    "border-rose-500/70 text-rose-300 hover:bg-rose-900/20 focus:ring-rose-500/50";
  const primary =
    "bg-cyan-500 text-slate-100 border-cyan-400 hover:bg-cyan-400 font-semibold";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        base,
        variant === "danger" ? danger : "",
        variant === "primary" ? primary : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);

/* ---------- types ---------- */

type WizardProps = {
  open: boolean;
  onClose: () => void;
  onDone?: (statementId: string) => void;
  seedYear?: number;
  seedMonth?: number;
};

type InputsModel = {
  beginningBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
};

function prevMonth(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/* ---------- component ---------- */

export default function ImportStatementWizard({
  open,
  onClose,
  onDone,
  seedYear,
  seedMonth,
}: WizardProps) {
  // We only READ spender state here (step 4 is confirmation-only)
  const { map: spenderMap, singleUser, ready: spendersReady } = useSpenders();
  const { profile } = useImportProfile();
  const { applyAlias } = useAliases();

  const now = new Date();
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);

  // Step 1 state
  const [stmtYear, setStmtYear] = React.useState<number>(
    seedYear ?? now.getFullYear()
  );
  const [stmtMonth, setStmtMonth] = React.useState<number>(
    seedMonth ?? now.getMonth() + 1
  );
  const [inputs, setInputs] = React.useState<InputsModel>({
    beginningBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
  });

  // Step 2 state – page-by-page paste
  const [pages, setPages] = React.useState<string[]>([]);
  const [currentDraft, setCurrentDraft] = React.useState<string>("");
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  // Step 3 state (computed)
  const [busy, setBusy] = React.useState(false);
  const [txs, setTxs] = React.useState<
    import("@/app/providers/ReconcilerProvider").Transaction[]
  >([]);
  const [parseErr, setParseErr] = React.useState<string | null>(null);

  const uniqueCards = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of txs) {
      const l4 = last4OrNull(t.cardLast4);
      if (l4) s.add(l4);
    }
    return Array.from(s);
  }, [txs]);

  // Do we show the read-only confirmation step?
  const needsUserConfirmation = uniqueCards.length > 0;

  // dynamic header steps
  const headerSteps = React.useMemo(
    () =>
      needsUserConfirmation
        ? [
            { n: 1 as const, label: "Statement Info" },
            { n: 2 as const, label: "Paste Pages" },
            { n: 3 as const, label: "Parse & Verify" },
            { n: 4 as const, label: "Users" },
          ]
        : [
            { n: 1 as const, label: "Statement Info" },
            { n: 2 as const, label: "Paste Pages" },
            { n: 3 as const, label: "Parse & Verify" },
          ],
    [needsUserConfirmation]
  );

  // reset when opened
  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setPages([]);
    setCurrentDraft("");
    setEditingIndex(null);
    setTxs([]);
    setParseErr(null);
  }, [open]);

  /* ---------- derived ---------- */
  const deposits = React.useMemo(
    () => txs.filter((t) => (t.amount ?? 0) > 0),
    [txs]
  );
  const withdrawals = React.useMemo(
    () => txs.filter((t) => (t.amount ?? 0) < 0),
    [txs]
  );

  const parsedDeposits = +deposits
    .reduce((s, r) => s + (r.amount ?? 0), 0)
    .toFixed(2);
  const parsedWithdrawals = +withdrawals
    .reduce((s, r) => s + Math.abs(r.amount ?? 0), 0)
    .toFixed(2);
  const endingBalance = +(
    (inputs.beginningBalance ?? 0) +
    parsedDeposits -
    parsedWithdrawals
  ).toFixed(2);

  const depDelta = +(parsedDeposits - (inputs.totalDeposits ?? 0)).toFixed(2);
  const wdrDelta = +(
    parsedWithdrawals - (inputs.totalWithdrawals ?? 0)
  ).toFixed(2);
  const endDelta = +(
    endingBalance -
    ((inputs.beginningBalance ?? 0) +
      (inputs.totalDeposits ?? 0) -
      (inputs.totalWithdrawals ?? 0))
  ).toFixed(2);

  const allGreen =
    depDelta === 0 &&
    wdrDelta === 0 &&
    endDelta === 0 &&
    txs.length > 0 &&
    !parseErr;

  /* ---------- actions ---------- */

  function useParsedTotals() {
    setInputs((prev) => ({
      ...prev,
      totalDeposits: parsedDeposits,
      totalWithdrawals: parsedWithdrawals,
    }));
  }

  function seedBeginningFromPrev() {
    const { year: py, month: pm } = prevMonth(stmtYear, stmtMonth);
    const prevId = makeId(py, pm);
    const idx = readIndex();
    const prev = idx[prevId];
    if (!prev) return;
    const prevRows = Array.isArray(prev.cachedTx) ? prev.cachedTx : [];
    const prevBegin = prev.inputs?.beginningBalance ?? 0;
    const prevDeposits = +prevRows
      .reduce((s, r: any) => s + (r.amount > 0 ? r.amount : 0), 0)
      .toFixed(2);
    const prevWithdrawals = +prevRows
      .reduce((s, r: any) => s + (r.amount < 0 ? Math.abs(r.amount) : 0), 0)
      .toFixed(2);
    const prevEnd = +(prevBegin + prevDeposits - prevWithdrawals).toFixed(2);
    setInputs((prev) => ({ ...prev, beginningBalance: prevEnd }));
  }

  function addOrSavePage() {
    const cleaned = normalizePageText(currentDraft || "");
    if (!cleaned.trim()) return;

    setPages((ps) => {
      if (editingIndex === null) {
        return [...ps, cleaned];
      } else {
        const next = ps.slice();
        next[editingIndex] = cleaned;
        return next;
      }
    });
    setCurrentDraft("");
    setEditingIndex(null);
  }

  function startEdit(i: number) {
    setEditingIndex(i);
    setCurrentDraft(pages[i] || "");
  }

  function removePage(i: number) {
    setPages((ps) => ps.filter((_, idx) => idx !== i));
    if (editingIndex === i) {
      setEditingIndex(null);
      setCurrentDraft("");
    } else if (editingIndex !== null && i < editingIndex) {
      setEditingIndex(editingIndex - 1);
    }
  }

  function clearAllPages() {
    setPages([]);
    setCurrentDraft("");
    setEditingIndex(null);
  }

  async function runParsing(explicitPages?: string[]) {
    setBusy(true);
    setParseErr(null);
    await new Promise((r) => setTimeout(r, 0)); // let "Parsing…" paint

    try {
      if (!profile) {
        setParseErr(
          "You need to complete onboarding before importing statements."
        );
        return;
      }
      const base = explicitPages ?? pages;
      if (!base.length) {
        setParseErr("No pages to parse.");
        return;
      }

      const sanitized = base.map((p) => normalizePageText(p));
      const res = rebuildFromPages(sanitized, stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);

      const cleaned = withRules.map((t) => ({
        ...t,
        cardLast4: last4OrNull(t.cardLast4) ?? undefined,
      }));

      setTxs(cleaned);
    } catch (e: any) {
      setParseErr(e?.message || "Failed to parse pages.");
    } finally {
      setBusy(false);
    }
  }

  function commitDraftIfNeeded(): string[] {
    const draft = currentDraft.trim();
    if (!draft) return pages;
    const cleaned = normalizePageText(draft);
    const next = [...pages, cleaned];
    setPages(next);
    setCurrentDraft("");
    setEditingIndex(null);
    return next;
  }

  function saveStatement() {
    const id = makeId(stmtYear, stmtMonth);
    const label = `${monthLabel(stmtMonth)} ${stmtYear}`;
    const existing = readIndex()[id];

    const base: StatementSnapshot =
      existing ?? emptyStatement(id, label, stmtYear, stmtMonth);

    const snap: StatementSnapshot = {
      ...base,
      stmtYear,
      stmtMonth,
      label,
      pagesRaw: pages,
      inputs: {
        beginningBalance: inputs.beginningBalance ?? 0,
        totalDeposits: inputs.totalDeposits ?? 0,
        totalWithdrawals: inputs.totalWithdrawals ?? 0,
      },
      cachedTx: txs.map((t) => ({
        ...t,
        cardLast4: last4OrNull(t.cardLast4) ?? undefined,
      })),
      normalizerVersion: NORMALIZER_VERSION,
    };

    upsertStatement(snap);
    onClose();
    onDone?.(id);
  }

  /* ---------- render ---------- */

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      aria-modal="true"
      role="dialog"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      {/* panel */}
      <div className="relative w-[min(980px,96vw)] max-h-[94vh] overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {headerSteps.map((s) => (
              <div key={s.n} className="flex items-center gap-2">
                <div
                  className={[
                    "w-6 h-6 rounded-full grid place-items-center border",
                    step === (s.n as any)
                      ? "bg-cyan-500 text-slate-900 border-cyan-400"
                      : step > (s.n as any)
                      ? "bg-emerald-500 text-white border-emerald-400"
                      : "bg-slate-800 border-slate-700 text-slate-300",
                  ].join(" ")}
                >
                  {s.n}
                </div>
                <div
                  className={
                    step === (s.n as any) ? "font-semibold" : "text-slate-300"
                  }
                >
                  {s.label}
                </div>
                {s.n !== headerSteps[headerSteps.length - 1].n && (
                  <div className="w-8 h-px bg-slate-700" />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-sm rounded-xl border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        {/* step 1 */}
        {step === 1 && (
          <Panel className="p-4 mt-4 space-y-4">
            <h3 className="font-semibold">1) General statement info</h3>
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-xs block mb-1 text-slate-400">
                  Statement Year
                </label>
                <input
                  type="number"
                  className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
                  value={stmtYear}
                  onChange={(e) =>
                    setStmtYear(Number(e.target.value) || stmtYear)
                  }
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-slate-400">
                  Statement Month
                </label>
                <select
                  className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
                  value={stmtMonth}
                  onChange={(e) => setStmtMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1 text-slate-400">
                  Beginning Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
                  value={inputs.beginningBalance}
                  onChange={(e) =>
                    setInputs((x) => ({
                      ...x,
                      beginningBalance: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarButton
                  onClick={seedBeginningFromPrev}
                  className="w-full sm:w-auto"
                >
                  Use previous ending as beginning
                </ToolbarButton>
              </div>

              <div>
                <label className="text-xs block mb-1 text-slate-400">
                  Total Deposits
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
                  value={inputs.totalDeposits}
                  onChange={(e) =>
                    setInputs((x) => ({
                      ...x,
                      totalDeposits: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-xs block mb-1 text-slate-400">
                  Total Withdrawals
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
                  value={inputs.totalWithdrawals}
                  onChange={(e) =>
                    setInputs((x) => ({
                      ...x,
                      totalWithdrawals: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <ToolbarButton onClick={() => setStep(2)} variant="default">
                Continue →
              </ToolbarButton>
            </div>
          </Panel>
        )}

        {/* step 2 — page-by-page paste */}
        {step === 2 && (
          <Panel className="p-4 mt-4 space-y-4">
            <h3 className="font-semibold">2) Paste pages</h3>
            {!profile && (
              <div className="text-sm text-rose-300">
                You need to complete onboarding before importing statements.
              </div>
            )}

            <p className="text-sm text-slate-300">
              Paste <strong>one page at a time</strong>, then click{" "}
              <em>{editingIndex === null ? "Add page" : "Save changes"}</em>.
              Repeat for each page.
            </p>

            <textarea
              rows={12}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500"
              placeholder={`Paste a single statement page here…`}
              value={currentDraft}
              onChange={(e) => setCurrentDraft(e.target.value)}
            />

            <div className="flex flex-wrap gap-2">
              <ToolbarButton
                onClick={addOrSavePage}
                disabled={!currentDraft.trim()}
                variant="primary"
                className="w-full sm:w-auto"
              >
                {editingIndex === null ? "Add page" : "Save changes"}
              </ToolbarButton>
              {editingIndex !== null && (
                <ToolbarButton
                  onClick={() => {
                    setEditingIndex(null);
                    setCurrentDraft("");
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel edit
                </ToolbarButton>
              )}
              {pages.length > 0 && (
                <ToolbarButton
                  onClick={clearAllPages}
                  variant="danger"
                  className="w-full sm:w-auto"
                >
                  Clear all pages
                </ToolbarButton>
              )}
            </div>

            {pages.length > 0 ? (
              <div className="text-xs text-slate-400">
                <div className="opacity-80 mb-1">
                  Pages ready: {pages.length}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {pages.map((p, i) => {
                    const lines = p.split(/\r?\n/).filter(Boolean).length;
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded-lg border border-slate-700 px-2 py-1"
                      >
                        <span>Page {i + 1}</span>
                        <span className="opacity-60">({lines} lines)</span>
                        <button
                          className="text-xs border border-slate-700 rounded-xl px-2 py-0.5 hover:bg-slate-800"
                          onClick={() => startEdit(i)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs border border-slate-700 rounded-xl px-2 py-0.5 hover:bg-slate-800"
                          onClick={() => removePage(i)}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="text-xs text-slate-400">No pages added yet.</div>
            )}

            <div className="flex justify-between">
              <ToolbarButton onClick={() => setStep(1)}>← Back</ToolbarButton>
              <ToolbarButton
                variant="primary"
                onClick={() => {
                  const next = commitDraftIfNeeded();
                  setStep(3);
                  setTimeout(() => runParsing(next), 0);
                }}
                disabled={
                  !profile || (pages.length === 0 && !currentDraft.trim())
                }
              >
                Continue to Parse →
              </ToolbarButton>
            </div>
          </Panel>
        )}

        {/* step 3 */}
        {step === 3 && (
          <Panel className="p-4 mt-4 space-y-4">
            <h3 className="font-semibold">3) Parse & verify totals</h3>

            {parseErr && (
              <div className="text-sm text-rose-300">{parseErr}</div>
            )}

            {/* Status tiles */}
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div
                className={`rounded-2xl border p-3 ${
                  depDelta === 0 ? "border-emerald-500" : "border-amber-500"
                }`}
              >
                <div className="text-xs text-slate-400">Parsed Deposits</div>
                <div
                  className={`text-lg font-semibold ${
                    depDelta === 0 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {money(parsedDeposits)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  User: {money(inputs.totalDeposits)} (Δ {money(depDelta)})
                </div>
              </div>

              <div
                className={`rounded-2xl border p-3 ${
                  wdrDelta === 0 ? "border-emerald-500" : "border-amber-500"
                }`}
              >
                <div className="text-xs text-slate-400">Parsed Withdrawals</div>
                <div
                  className={`text-lg font-semibold ${
                    wdrDelta === 0 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {money(parsedWithdrawals)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  User: {money(inputs.totalWithdrawals)} (Δ {money(wdrDelta)})
                </div>
              </div>

              <div
                className={`rounded-2xl border p-3 ${
                  endDelta === 0 ? "border-emerald-500" : "border-rose-500"
                }`}
              >
                <div className="text-xs text-slate-400">Ending Balance</div>
                <div
                  className={`text-lg font-semibold ${
                    endDelta === 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {money(
                    (inputs.beginningBalance ?? 0) +
                      parsedDeposits -
                      parsedWithdrawals
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  User:{" "}
                  {money(
                    (inputs.beginningBalance ?? 0) +
                      (inputs.totalDeposits ?? 0) -
                      (inputs.totalWithdrawals ?? 0)
                  )}{" "}
                  (Δ {money(endDelta)})
                </div>
              </div>
            </div>

            {/* Assistance */}
            {!(depDelta === 0 && wdrDelta === 0) && (
              <div className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
                <div className="font-medium text-amber-300 mb-1">
                  Something’s off
                </div>
                <ul className="list-disc pl-5 space-y-1 text-amber-200/90">
                  <li>Verify that all statement pages were added.</li>
                  <li>
                    Check if any amounts are negative/positive where they
                    shouldn’t be.
                  </li>
                  <li>
                    If your bank shows credits in parentheses, ensure they’re
                    captured correctly.
                  </li>
                  <li>
                    Try “Use parsed totals” if your entered totals were manual.
                  </li>
                </ul>
              </div>
            )}

            <div className="flex justify-between">
              <ToolbarButton onClick={() => setStep(2)}>← Back</ToolbarButton>
              <div className="flex gap-2">
                <ToolbarButton onClick={runParsing} disabled={busy}>
                  {busy ? "Parsing…" : "Re-run parsing"}
                </ToolbarButton>
                <ToolbarButton onClick={useParsedTotals}>
                  Use parsed totals
                </ToolbarButton>
                <ToolbarButton
                  variant="primary"
                  onClick={() => {
                    if (needsUserConfirmation) setStep(4);
                    else saveStatement();
                  }}
                  disabled={!allGreen}
                >
                  {needsUserConfirmation ? "Continue →" : "Finish & Save"}
                </ToolbarButton>
              </div>
            </div>
          </Panel>
        )}

        {/* step 4 — read-only confirmation of user assignments */}
        {step === 4 && (
          <Panel className="p-4 mt-4 space-y-4">
            <h3 className="font-semibold">4) Users</h3>

            {!spendersReady ? (
              <div className="text-sm text-slate-300">
                Loading your user labels…
              </div>
            ) : singleUser ? (
              <div className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Single-user mode is active. We won’t show a “User” column in the
                Reconciler.
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  We detected the following card last-4 values in this
                  statement. We’ll assign them using your saved labels from
                  onboarding.
                </p>
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="text-left p-2">Card</th>
                        <th className="text-left p-2">Assigned user</th>
                        <th className="text-left p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueCards.map((l4) => {
                        const name = spenderMap[canon(l4)] || "";
                        const ok = !!name;
                        return (
                          <tr key={l4} className="border-t border-slate-800">
                            <td className="p-2">•••• {l4}</td>
                            <td className="p-2">
                              {ok ? (
                                name
                              ) : (
                                <span className="text-slate-400">
                                  Unassigned
                                </span>
                              )}
                            </td>
                            <td className="p-2">
                              {ok ? (
                                <span className="inline-block text-emerald-300 border border-emerald-500/70 bg-emerald-500/10 rounded-lg px-2 py-0.5 text-xs">
                                  ✓ Ready
                                </span>
                              ) : (
                                <span className="inline-block text-amber-300 border border-amber-500/70 bg-amber-500/10 rounded-lg px-2 py-0.5 text-xs">
                                  ! No saved label
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!uniqueCards.some((l4) => spenderMap?.[l4]) && (
                  <div className="text-xs text-amber-300">
                    Heads up: none of these cards have saved labels yet. You can
                    finish now and adjust later in Settings → Users.
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between">
              <ToolbarButton onClick={() => setStep(3)}>← Back</ToolbarButton>
              <ToolbarButton variant="primary" onClick={saveStatement}>
                Finish & Save
              </ToolbarButton>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
