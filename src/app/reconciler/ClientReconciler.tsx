// app/reconciler/page.tsx
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import ProtectedRoute from "@/components/ProtectedRoute";
import StatementSwitcher from "@/components/StatementSwitcher";
import ImportStatementWizard from "@/components/ImportPagesDialog";
import CategorySelect from "@/components/CategorySelect";

import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { useCategories } from "@/app/providers/CategoriesProvider";
import { useSpenders } from "@/lib/spenders";

import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  emptyStatement,
  upsertStatement,
  type StatementSnapshot,
} from "@/lib/statements";

import { normalizePageText, NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { rebuildFromPages } from "@/lib/import/reconcile";
import {
  readCatRules,
  applyCategoryRulesTo,
  upsertCategoryRules,
} from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { stripAuthAndCard, userFromLast4, prettyDesc } from "@/lib/txEnrich";
import { writeOverride, keyForTx } from "@/lib/overrides";

import {
  withCanonicalCategories,
  catOf,
} from "@/helpers/reconciler/reconciler-canon";
import { tagCashBackLine, isCashBackLine } from "@/helpers/reconciler/cashback";
import { merchantTokenSet, anyIntersect } from "@/helpers/reconciler/tokenizer";
import { buildDisambiguatorPhrases } from "@/helpers/reconciler/disambiguators";
import { bulkApplyOverrideAcrossAllStatements } from "@/helpers/reconciler/reconciler-bulk";
import DemoSeeder from "@/helpers/reconciler/demo-seeder";
import { ToolbarButton } from "@/helpers/reconciler/ui";
import WipeStatementDialog from "@/components/reconciler/WipeStatementDialog";

/* ----------------------------- tiny UI helpers ---------------------------- */

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => moneyFmt.format(n);

function calcStatementTotals(rows: { amount?: number }[]) {
  let deposits = 0;
  let withdrawals = 0;
  for (const r of rows) {
    const a = +(r.amount ?? 0);
    if (a > 0) deposits += a;
    else if (a < 0) withdrawals += Math.abs(a);
  }
  return {
    deposits: +deposits.toFixed(2),
    withdrawals: +withdrawals.toFixed(2),
  };
}

function Panel(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;
  return (
    <section
      className={`rounded-2xl border border-slate-700 bg-slate-900 ${className}`}
      {...rest}
    />
  );
}

/* --------------------------------- page ---------------------------------- */

export default function ReconcilerPage() {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;
  const router = useRouter();

  const ignoreNextUrl = React.useRef(false);

  // show/hide user column if multi-user setup
  const { singleUser, setupComplete } = useSpenders();
  const showUserCol = setupComplete && singleUser === false;

  const { transactions, setTransactions, inputs, setInputs } =
    useReconcilerSelectors();
  const { categories, findBySlug, findByNameCI, setAll } =
    useCategories() as any;

  const [statements, setStatements] = React.useState<
    Record<string, StatementSnapshot>
  >({});
  const [currentId, setCurrentId] = React.useState<string>("");
  const [openWizard, setOpenWizard] = React.useState(false);

  const [wipeOpen, setWipeOpen] = React.useState(false);
  const [justCleared, setJustCleared] = React.useState(false); // show re-import banner when true

  // Mount demo seeder only on /demo
  const onDemo = isDemo;
  // eslint-disable-next-line react/jsx-no-useless-fragment
  const DemoMount = onDemo ? <DemoSeeder /> : <></>;

  // bootstrap once
  const booted = React.useRef(false);

  React.useEffect(() => {
    if (booted.current) return;

    const idx = readIndex();
    const haveAny = Object.keys(idx).length > 0;

    if (!haveAny) {
      if (!isDemo) {
        // No data → open wizard
        setStatements({});
        setTransactions([]);
        setInputs({
          beginningBalance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
        });
        setOpenWizard(true);
        booted.current = true;
        return;
      }
      // On /demo, DemoSeeder populates readIndex() and provider state itself.
    }

    // choose a month
    const saved = readCurrentId();
    const selected =
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      ).get("statement") ||
      "" ||
      saved ||
      Object.keys(idx)[0] ||
      "";

    if (!selected) {
      if (!isDemo) setOpenWizard(true);
      booted.current = true;
      return;
    }

    setCurrentId(selected);
    writeCurrentId(selected);

    // hydrate provider from snapshot
    const s = idx[selected];
    if (s) {
      setInputs({
        beginningBalance: s.inputs?.beginningBalance ?? 0,
        totalDeposits: s.inputs?.totalDeposits ?? 0,
        totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
      });

      // Build tx → rules → canon → cashback tag
      const rules = readCatRules();

      let base: any[] = [];
      if (Array.isArray(s.cachedTx) && s.cachedTx.length) {
        base = s.cachedTx;
      } else if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
        const sanitized = (s.pagesRaw || []).map(normalizePageText);
        const res = rebuildFromPages(sanitized, s.stmtYear, applyAlias);
        base = res.txs;
      }

      let withRules = applyCategoryRulesTo(rules, base, applyAlias);
      let normalized = withCanonicalCategories(withRules, { isDemo });
      normalized = tagCashBackLine(normalized); // <-- ensure cash-back tagged exactly once

      setTransactions(normalized);
      setStatements(readIndex());
    } else {
      setTransactions([]);
    }

    // mirror URL (non-demo)
    if (!isDemo) {
      const sp = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      sp.set("statement", selected);
      ignoreNextUrl.current = true;
      router.replace(`${pathname}?${sp.toString()}`);
    }

    booted.current = true;
  }, [isDemo, pathname, router, setInputs, setTransactions]);

  const searchParams = useSearchParams();
  const qidFromUrl = searchParams?.get("statement") || "";

  // respond to URL ?statement changes
  React.useEffect(() => {
    // If we programmatically changed the URL, skip reacting once
    if (ignoreNextUrl.current) {
      ignoreNextUrl.current = false;
      return;
    }

    const qid = qidFromUrl;
    if (!qid || qid === currentId) return;

    const idx = readIndex();
    if (!idx[qid]) return;

    setCurrentId(qid);
    writeCurrentId(qid);

    const s = idx[qid];
    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });

    const rules = readCatRules();
    let base: any[] = [];
    if (Array.isArray(s.cachedTx) && s.cachedTx.length) base = s.cachedTx;
    else if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
      const sanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(sanitized, s.stmtYear, applyAlias);
      base = res.txs;
    }

    let withRules = applyCategoryRulesTo(rules, base, applyAlias);
    let normalized = withCanonicalCategories(withRules, { isDemo });
    normalized = tagCashBackLine(normalized);

    setTransactions(normalized);
    setStatements(readIndex());
  }, [qidFromUrl, currentId, isDemo, setInputs, setTransactions]);

  // switcher handler
  function onSwitchStatement(id: string) {
    setCurrentId(id);
    writeCurrentId(id);

    const idx = readIndex();
    const s = idx[id];
    if (!s) return;

    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });

    const rules = readCatRules();
    let base: any[] = [];
    if (Array.isArray(s.cachedTx) && s.cachedTx.length) base = s.cachedTx;
    else if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
      const sanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(sanitized, s.stmtYear, applyAlias);
      base = res.txs;
    }
    let withRules = applyCategoryRulesTo(rules, base, applyAlias);
    let normalized = withCanonicalCategories(withRules, { isDemo });
    normalized = tagCashBackLine(normalized);

    setTransactions(normalized);
    setStatements(readIndex());

    if (!isDemo) {
      const sp = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      sp.set("statement", id);
      ignoreNextUrl.current = true;
      router.replace(`${pathname}?${sp.toString()}`);
    }
  }

  function afterWizardSaved(newId: string) {
    // The wizard upserts snapshots; just load the new one
    onSwitchStatement(newId);
    setOpenWizard(false);
  }

  /* --------------------------- derived view data -------------------------- */

  const withdrawals = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) < 0),
    [transactions]
  );
  const deposits = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) > 0),
    [transactions]
  );

  const groups = React.useMemo(() => {
    const m = new Map<string, { rows: typeof withdrawals; total: number }>();
    for (const t of withdrawals) {
      const k = t.date || "";
      const g = m.get(k) ?? { rows: [], total: 0 };
      g.rows.push(t as any);
      g.total += Math.abs(t.amount ?? 0);
      m.set(k, g);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [withdrawals]);

  const hasData = (s: any) =>
    (Array.isArray(s?.cachedTx) && s.cachedTx.length > 0) ||
    (Array.isArray(s?.pagesRaw) && s.pagesRaw.length > 0);

  /* --------------------------- category create once ----------------------- */

  const ensureCategoryExists = React.useCallback(
    (name: string) => {
      const label = (name || "").trim();
      if (!label) return;
      const exists =
        categories.some(
          (c: any) => c.name.toLowerCase() === label.toLowerCase()
        ) ||
        categories.some(
          (c: any) =>
            c.slug === (label || "").toLowerCase().replace(/\s+/g, "-")
        );
      if (!exists) {
        setAll([
          ...categories,
          {
            id:
              crypto.randomUUID?.() ??
              `cat-${Math.random().toString(36).slice(2)}`,
            name: label,
            icon: "🗂️",
            color: "#475569",
            hint: "",
            slug: (label || "").toLowerCase().replace(/\s+/g, "-"),
          },
        ]);
      }
    },
    [categories, setAll]
  );

  const stmtTotals = React.useMemo(
    () => calcStatementTotals(transactions ?? []),
    [transactions]
  );

  // Remove the month entirely; then jump to a neighboring month if possible.
  function handleRemoveCompletely() {
    if (!currentId) return;

    try {
      const idx = readIndex();
      if (!idx[currentId]) {
        setWipeOpen(false);
        return;
      }

      // Build a next selection before mutation (prefer previous month, else next)
      const keys = Object.keys(idx).sort(); // YYYY-MM strings sort chronologically
      const i = keys.indexOf(currentId);
      const nextId =
        (i > 0 ? keys[i - 1] : undefined) ??
        (i >= 0 && i < keys.length - 1 ? keys[i + 1] : undefined) ??
        "";

      // Delete the month from the index
      delete idx[currentId];
      localStorage.setItem(
        "reconciler.statements.index.v2",
        JSON.stringify(idx)
      );

      // If we removed the current one, move selection and clear view state
      if (nextId) {
        setCurrentId(nextId);
        writeCurrentId(nextId);
      } else {
        setCurrentId("");
        writeCurrentId("");
      }

      setTransactions([]);
      setInputs({
        beginningBalance: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
      } as any);
      setJustCleared(false); // no re-import banner on full removal
    } finally {
      setWipeOpen(false);
    }
  }

  // Clear the month but keep it selected for re-import (show banner)
  function handleReimportFresh() {
    if (!currentId) return;

    try {
      const idx = readIndex();
      const snap = idx[currentId];
      if (!snap) {
        setWipeOpen(false);
        return;
      }

      const cleared = {
        ...snap,
        cachedTx: [],
        pagesRaw: [],
        inputs: { beginningBalance: 0, totalDeposits: 0, totalWithdrawals: 0 },
        normalizerVersion: 0,
      };
      upsertStatement(cleared);

      // Reflect in UI
      setTransactions([]);
      setInputs({
        beginningBalance: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
      } as any);
      setJustCleared(true); // show the “please import again” banner
    } finally {
      setWipeOpen(false);
    }
  }

  /* -------------------------------- render -------------------------------- */

  return (
    <ProtectedRoute>
      {DemoMount}

      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Reconciler</h1>

          {/* Per-statement totals (visible immediately) */}
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
            <span className="text-xs text-slate-400">Withdrawals</span>
            <span className="text-sm font-semibold text-rose-300">
              {money(stmtTotals.withdrawals)}
            </span>
            <span className="mx-2 text-slate-700">|</span>
            <span className="text-xs text-slate-400">Deposits</span>
            <span className="text-sm font-semibold text-emerald-300">
              {money(stmtTotals.deposits)}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <StatementSwitcher
              value={currentId}
              onChange={(id) => onSwitchStatement(id)}
              available={Object.values(statements)
                .filter(hasData)
                .sort(
                  (a, b) => a.stmtYear - b.stmtYear || a.stmtMonth - b.stmtMonth
                )
                .map((s) => s.id)}
              showLabel={false}
              size="sm"
              className="w-44 sm:w-56"
            />

            {/* NEW: Reset button */}
            <button
              type="button"
              onClick={() => setWipeOpen(true)}
              className="h-9 px-3 rounded-2xl border text-sm bg-slate-900 border-slate-700 hover:bg-slate-800"
              title="Wipe or re-import this statement"
            >
              Reset…
            </button>

            {/* Existing: + New Statement button */}
            <ToolbarButton onClick={() => setOpenWizard(true)}>
              + New Statement
            </ToolbarButton>
          </div>
        </div>

        {justCleared && (transactions?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-900/20 p-4">
            <div className="text-sm">
              <span className="font-medium text-amber-200">
                No statement data available.
              </span>{" "}
              Please import this month’s data again.
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOpenWizard(true)}
                className="h-9 px-3 rounded-xl bg-amber-600 text-white text-sm hover:bg-amber-500"
              >
                Open Import Wizard
              </button>
            </div>
          </div>
        )}

        {/* Withdrawals grouped by date */}
        <div className="rounded-2xl border border-slate-700 divide-y divide-slate-800 overflow-x-auto">
          {groups.length === 0 && (
            <div className="p-3 text-sm text-slate-400">
              No withdrawals yet. Add a statement to get started.
            </div>
          )}

          {groups.map(([date, g]) => (
            <div key={date}>
              <div className="w-full flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{date}</span>
                  <span className="text-xs text-slate-400">
                    ({g.rows.length} tx)
                  </span>
                </div>
                <div className="text-sm">
                  Day total:{" "}
                  <span className="font-medium text-rose-400">
                    {money(g.total)}
                  </span>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="text-left p-2 w-1/2">Description</th>
                    <th className="text-left p-2">Category</th>
                    {showUserCol && <th className="text-left p-2">User</th>}
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="p-2">{prettyDesc(t.description)}</td>
                      <td className="p-2">
                        {(() => {
                          const currentLabel = catOf(t);
                          const picked =
                            findByNameCI(currentLabel) ||
                            findBySlug(currentLabel);
                          const currentSlug =
                            picked?.slug ??
                            currentLabel.toLowerCase().replace(/\s+/g, "-");

                          return (
                            <CategorySelect
                              value={currentSlug}
                              onChange={(slug: string) => {
                                const picked =
                                  findBySlug(slug) || findByNameCI(slug);
                                const label = picked?.name ?? currentLabel;

                                ensureCategoryExists(label);

                                // Stable keys from description (tokens + phrases)
                                const aliasLabel =
                                  applyAlias(
                                    stripAuthAndCard(t.description || "")
                                  ) ?? "";
                                const phraseKeys = buildDisambiguatorPhrases(
                                  t.description || "",
                                  aliasLabel
                                );

                                const k = keyForTx(
                                  t.date || "",
                                  t.description || "",
                                  t.amount ?? 0
                                );
                                writeOverride(k, label);

                                if (phraseKeys.length)
                                  upsertCategoryRules(phraseKeys, label);

                                // Re-run table with current rules; then canonicalize + tag cash-back
                                const rules = readCatRules();
                                let updated = applyCategoryRulesTo(
                                  rules,
                                  transactions,
                                  applyAlias
                                );
                                updated = withCanonicalCategories(updated, {
                                  isDemo,
                                });
                                updated = tagCashBackLine(updated);

                                // Explicitly set this row
                                updated = updated.map((r) =>
                                  r.id === t.id
                                    ? { ...r, categoryOverride: label }
                                    : r
                                );

                                // In-view bulk by merchant tokens, but NEVER cross CB ↔ non-CB
                                const anchorTokens = merchantTokenSet(
                                  t.description || ""
                                );
                                const anchorIsCB = isCashBackLine(
                                  t.amount ?? 0,
                                  t.description || ""
                                );

                                if (anchorTokens.size) {
                                  const allW = updated.filter(
                                    (r) => (r.amount ?? 0) < 0
                                  );
                                  const candidates = allW.filter((r) => {
                                    if (r.id === t.id) return false;
                                    if (!(r.description || "").trim())
                                      return false;
                                    if (
                                      !anyIntersect(
                                        anchorTokens,
                                        merchantTokenSet(r.description || "")
                                      )
                                    )
                                      return false;
                                    const rIsCB = isCashBackLine(
                                      r.amount ?? 0,
                                      r.description || ""
                                    );
                                    return rIsCB === anchorIsCB; // guard: don't mix cash-back line with normal line
                                  });

                                  const MAX_BULK = 24;
                                  const MAX_SHARE = 0.5;
                                  if (
                                    candidates.length <= MAX_BULK &&
                                    candidates.length <=
                                      Math.floor(allW.length * MAX_SHARE)
                                  ) {
                                    const ids = new Set(
                                      candidates.map((r) => r.id)
                                    );
                                    updated = updated.map((r) =>
                                      ids.has(r.id)
                                        ? { ...r, categoryOverride: label }
                                        : r
                                    );
                                  }
                                }

                                setTransactions(updated);

                                // Persist snapshot (idempotent)
                                try {
                                  const idx = readIndex();
                                  const snap = idx[currentId];
                                  if (snap) {
                                    const next: StatementSnapshot = {
                                      ...snap,
                                      cachedTx: updated,
                                      normalizerVersion: Math.max(
                                        NORMALIZER_VERSION,
                                        snap.normalizerVersion ?? 0
                                      ),
                                    };
                                    upsertStatement(next);
                                    setStatements(readIndex());
                                  }
                                } catch {}

                                // Cross-statement bulk (safe default excludes CB inside helper)
                                bulkApplyOverrideAcrossAllStatements(
                                  t.description || "",
                                  label,
                                  isDemo
                                );
                              }}
                            />
                          );
                        })()}
                      </td>

                      {showUserCol && (
                        <td className="p-2">
                          {t.user ??
                            (t.cardLast4
                              ? userFromLast4(t.cardLast4)
                              : "Joint")}
                        </td>
                      )}
                      <td className="p-2 text-right text-rose-400">
                        {money(Math.abs(t.amount ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Deposits table */}
        <Panel className="p-4 overflow-x-auto">
          <h3 className="font-semibold mb-3">Deposits</h3>
          {deposits.length === 0 ? (
            <div className="text-sm text-slate-400">No deposits.</div>
          ) : (
            <table className="w-full text-sm min-w-[420px]">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="text-left p-2 w-20">Date</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((t) => (
                  <tr key={`dep-${t.id}`} className="border-t border-slate-800">
                    <td className="p-2">{t.date}</td>
                    <td className="p-2">{t.description}</td>
                    <td className="p-2 text-right text-emerald-400">
                      {money(t.amount ?? 0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-800 font-medium">
                  <td className="p-2" colSpan={2}>
                    Total
                  </td>
                  <td className="p-2 text-right">
                    {money(
                      +deposits
                        .reduce((s, r) => s + (r.amount ?? 0), 0)
                        .toFixed(2)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <WipeStatementDialog
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onRemoveCompletely={handleRemoveCompletely}
        onReimportFresh={handleReimportFresh}
      />

      <ImportStatementWizard
        open={openWizard}
        onClose={() => setOpenWizard(false)}
        onDone={afterWizardSaved}
      />
    </ProtectedRoute>
  );
}
