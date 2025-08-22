// app/reconciler/page.tsx
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  upsertStatement,
  emptyStatement,
  monthLabel,
  makeId,
  migrateLegacyIfNeeded,
  type StatementSnapshot,
} from "@/lib/statements";
import { normalizePageText, NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { rebuildFromPages } from "@/lib/import/reconcile";
import { useAliases } from "@/app/providers/AliasesProvider";
import { stripAuthAndCard, userFromLast4, prettyDesc } from "@/lib/txEnrich";
import {
  readCatRules,
  applyCategoryRulesTo,
  candidateKeys,
  upsertCategoryRules,
} from "@/lib/categoryRules";
import { writeOverride, keyForTx } from "@/lib/overrides";
import StatementSwitcher from "@/components/StatementSwitcher";
import ProtectedRoute from "@/components/ProtectedRoute";
import ImportStatementWizard from "@/components/ImportPagesDialog";
import { useCategories } from "@/app/providers/CategoriesProvider";
import { TxRow } from "@/lib/types";
import { useSpenders } from "@/lib/spenders";
import CategoryManagerDialog from "@/components/CategoryManagerDialog";
import { useAuthUID } from "@/lib/fx";
import {
  markStartersApplied,
  readStarterCats,
  readStarterRules,
  startersAlreadyApplied,
} from "@/lib/starters";

/* --- tiny UI bits --- */

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
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3 rounded-2xl border text-sm bg-slate-900 border-slate-700 hover:bg-slate-800"
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

// keeps the same API, adds a real Add button and safeguards
const CATEGORY_ADD_SENTINEL = "__ADD__";

function CategorySelect({
  value,
  onChange,
  disabled = false, // optional - default false
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { categories } = useCategories();
  const [openMgr, setOpenMgr] = React.useState(false);

  const sorted = React.useMemo(() => {
    const set = new Set(categories.map((c) => c.trim()).filter(Boolean));
    if (value && !set.has(value)) set.add(value); // ensure current shows up
    const list = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const i = list.findIndex((x) => x.toLowerCase() === "uncategorized");
    if (i >= 0) {
      const [u] = list.splice(i, 1);
      list.push(u === "Uncategorized" ? u : "Uncategorized");
    }
    return list;
  }, [categories, value]);

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CATEGORY_ADD_SENTINEL) {
              // open manager but keep the current value selected
              setOpenMgr(true);
              return;
            }
            onChange(v);
          }}
          className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl px-2 py-1"
        >
          {sorted.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {/* keep this enabled; some browsers ignore clicks if <select> disabled */}
          <option value={CATEGORY_ADD_SENTINEL}>＋ Add Category…</option>
        </select>
      </div>

      <CategoryManagerDialog open={openMgr} onClose={() => setOpenMgr(false)} />
    </>
  );
}

/* --- page --- */

export default function ReconcilerPage() {
  const uid = useAuthUID();
  const { categories, setAll, setCategories } = useCategories() as any;

  React.useEffect(() => {
    if (!uid) return;
    if (startersAlreadyApplied(uid)) return;

    const starters = readStarterCats(uid); // [{ id, name, icon?, color? }]
    if (!Array.isArray(starters) || starters.length === 0) {
      markStartersApplied(uid);
      return;
    }

    // Merge by name (case-insensitive) into provider
    const existing = Array.isArray(categories) ? categories : [];
    const lower = new Set(existing.map((n: string) => (n || "").toLowerCase()));
    const merged = [...existing];
    for (const c of starters) {
      const name = (c?.name || "").trim();
      if (name && !lower.has(name.toLowerCase())) merged.push(name);
    }

    // Use whichever setter your provider exposes:
    if (typeof setAll === "function") setAll(merged);
    else if (typeof setCategories === "function") setCategories(merged);

    // (Optional) Seed simple rules so they’re available immediately.
    // We translate starter rules’ categoryId -> category name.
    const idToName = new Map(starters.map((c) => [c.id, c.name]));
    const srules = readStarterRules(uid);
    for (const r of srules) {
      const catName = idToName.get(r.categoryId);
      if (!catName) continue;
      // Minimal seed: treat pattern as a candidate key.
      // Your upsertCategoryRules(keys, category) already handles storage/merge.
      upsertCategoryRules([r.pattern], catName);
    }

    markStartersApplied(uid);
  }, [uid, categories, setAll, setCategories]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { singleUser, setupComplete } = useSpenders();
  const showUserCol = setupComplete && singleUser === false;

  const [headerBusy, setHeaderBusy] = React.useState(false);

  async function ensureUpToDateParse(s: StatementSnapshot) {
    if ((s.normalizerVersion ?? 0) >= NORMALIZER_VERSION) return s;

    setHeaderBusy(true);
    try {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, s.stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);

      const updated: StatementSnapshot = {
        ...s,
        cachedTx: withRules,
        normalizerVersion: NORMALIZER_VERSION,
      };
      upsertStatement(updated);
      setStatements(readIndex());
      setTransactions(withRules);
      return updated;
    } finally {
      setHeaderBusy(false);
    }
  }

  const { applyAlias } = useAliases();
  React.useEffect(() => {
    (window as any).__applyAlias = applyAlias;
  }, [applyAlias]);

  const { transactions, setTransactions, inputs, setInputs } =
    useReconcilerSelectors();

  const [statements, setStatements] = React.useState<
    Record<string, StatementSnapshot>
  >({});
  const [currentId, setCurrentId] = React.useState<string>("");

  const [openWizard, setOpenWizard] = React.useState(false);

  // keep ?statement in URL
  const setStatementInUrl = React.useCallback(
    (id?: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (id) sp.set("statement", id);
      else sp.delete("statement");
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams]
  );

  React.useEffect(() => {
    // migrate / bootstrap
    migrateLegacyIfNeeded();

    let idx = readIndex();
    if (!Object.keys(idx).length) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const id = makeId(y, m);
      const label = `${monthLabel(m)} ${y}`;
      upsertStatement(emptyStatement(id, label, y, m));
      idx = readIndex();
    }

    setStatements(idx);
    const initialUrlStatement = searchParams.get("statement");
    const cid = initialUrlStatement || readCurrentId() || Object.keys(idx)[0];
    setCurrentId(cid);
    setStatementInUrl(cid);

    const cur = idx[cid];
    setInputs({
      beginningBalance: cur?.inputs?.beginningBalance ?? 0,
      totalDeposits: cur?.inputs?.totalDeposits ?? 0,
      totalWithdrawals: cur?.inputs?.totalWithdrawals ?? 0,
    });

    if (cur?.pagesRaw?.length) {
      const pagesSanitized = (cur.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, cur.stmtYear, applyAlias);
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(txWithRules);
      // ensure latest normalization + parse
      ensureUpToDateParse(cur);
    } else {
      setTransactions([]);
      // New/empty → open wizard
      setOpenWizard(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // respond to URL changes
  const urlStatement = searchParams.get("statement") ?? "";
  React.useEffect(() => {
    if (!urlStatement) return;
    if (currentId && currentId === urlStatement) return;
    onSwitchStatement(urlStatement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatement]);

  function onSwitchStatement(id: string) {
    setCurrentId(id);
    writeCurrentId(id);

    const s = readIndex()[id];
    if (!s) return;

    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });

    if (s.pagesRaw?.length) {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(
        pagesSanitized || [],
        s.stmtYear,
        applyAlias
      );
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(withRules);
      ensureUpToDateParse(s);
    } else {
      setTransactions([]);
      setOpenWizard(true);
    }
  }

  function afterWizardSaved(newId: string) {
    const idx = readIndex();
    setStatements(idx);
    setCurrentId(newId);
    setStatementInUrl(newId);

    const s = idx[newId];
    if (!s) return;

    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });

    const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
    const res = rebuildFromPages(pagesSanitized || [], s.stmtYear, applyAlias);
    const rules = readCatRules();
    const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
    setTransactions(withRules);
  }

  // Parsed-only views
  const deposits = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) > 0),
    [transactions]
  );
  const withdrawals = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) < 0),
    [transactions]
  );

  const groups = React.useMemo(() => {
    const m = new Map<string, { rows: TxRow[]; total: number }>();
    for (const t of withdrawals) {
      const k = t.date || "";
      const g = m.get(k) ?? { rows: [], total: 0 };
      g.rows.push(t);
      g.total += Math.abs(t.amount);
      m.set(k, g);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [withdrawals]);

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Reconciler</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              Statement
            </span>
            <StatementSwitcher
              available={Object.values(statements)
                .map((s) => ({ id: s.id, y: s.stmtYear, m: s.stmtMonth }))
                .sort((a, b) => a.y - b.y || a.m - b.m)
                .map((x) => x.id)}
              showLabel={false}
              size="sm"
              className="w-44 sm:w-56"
            />
            <ToolbarButton onClick={() => setOpenWizard(true)}>
              + New Statement
            </ToolbarButton>
          </div>
        </div>

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
                        <CategorySelect
                          value={
                            t.categoryOverride ?? t.category ?? "Uncategorized"
                          }
                          onChange={(val) => {
                            const aliasLabel = applyAlias(
                              stripAuthAndCard(t.description || "")
                            );
                            const keys = candidateKeys(
                              t.description || "",
                              aliasLabel
                            );
                            const k = keyForTx(
                              t.date || "",
                              t.description || "",
                              t.amount ?? 0
                            );
                            writeOverride(k, val);
                            upsertCategoryRules(keys, val);

                            const rules = readCatRules();
                            const withRules = applyCategoryRulesTo(
                              rules,
                              transactions,
                              applyAlias
                            ).map((r) =>
                              r.id === t.id
                                ? { ...r, categoryOverride: val }
                                : r
                            );
                            setTransactions(withRules);
                          }}
                        />
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
                        {money(Math.abs(t.amount))}
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
                      {money(t.amount)}
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

      {/* Wizard modal */}
      <ImportStatementWizard
        open={openWizard}
        onClose={() => setOpenWizard(false)}
        onDone={afterWizardSaved}
      />
    </ProtectedRoute>
  );
}
