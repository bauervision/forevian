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
import DemoReconcilerTips from "../../components/DemoReconcilerTips";
import { DEMO_MONTHS, DEMO_VERSION } from "@/app/demo/data";
import { applyAlias } from "@/lib/aliases";
import BottomCoach from "@/components/BottomCoach";

/* --- tiny UI bits --- */
function useEnsureCategoryExists() {
  const { categories = [], setAll, setCategories } = useCategories() as any;

  return React.useCallback(
    (name: string) => {
      const label = (name || "").trim();
      if (!label) return;

      const lower = new Set(
        (categories || []).map((c: string) => c.toLowerCase())
      );
      if (lower.has(label.toLowerCase())) return;

      const next = [...categories, label];
      if (typeof setAll === "function") setAll(next);
      else if (typeof setCategories === "function") setCategories(next);
    },
    [categories, setAll, setCategories]
  );
}

const inputsFromStmt = (s?: StatementSnapshot) => ({
  beginningBalance: s?.inputs?.beginningBalance ?? 0,
  totalDeposits: s?.inputs?.totalDeposits ?? 0,
  totalWithdrawals: s?.inputs?.totalWithdrawals ?? 0,
});

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
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { categories } = useCategories();
  const [openMgr, setOpenMgr] = React.useState(false);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  // track pre-open list so we can detect what was added
  const beforeCatsRef = React.useRef<string[] | null>(null);
  const [awaitingNew, setAwaitingNew] = React.useState(false);

  const sorted = React.useMemo(() => {
    const set = new Set(categories.map((c) => c.trim()).filter(Boolean));
    if (value && !set.has(value)) set.add(value); // ensure current shows
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

  // after the manager closes, detect newly-added label & apply it
  React.useEffect(() => {
    if (openMgr) return; // wait until dialog is closed
    if (!awaitingNew) return; // only if we opened via ＋ Add

    setAwaitingNew(false);

    const before = beforeCatsRef.current ?? [];
    beforeCatsRef.current = null;

    const lower = new Set(before.map((c) => c.toLowerCase()));
    const added = (categories || []).filter((c) => !lower.has(c.toLowerCase()));

    if (added.length > 0) {
      // Heuristic: pick the first non-"Uncategorized" new label, else the first
      const pick =
        added.find((c) => c.toLowerCase() !== "uncategorized") ?? added[0];
      onChange(pick); // ✅ auto-assign the new category
    }
  }, [openMgr, awaitingNew, categories, onChange]);

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          ref={selectRef}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__ADD__") {
              // snapshot the list so we can diff later
              beforeCatsRef.current = [...(categories || [])];
              setAwaitingNew(true);
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
          <option value="__ADD__">＋ Add Category…</option>
        </select>
      </div>

      {/* Mount the manager only when open, and re-mount when categories change */}
      {openMgr && (
        <CategoryManagerDialog
          key={`mgr-${categories.length}-${categories.join("|")}`}
          open
          onClose={() => setOpenMgr(false)}
          // onAdded={(newName) => {
          //   onChange(newName);
          //   selectRef.current?.focus(); // NEW
          // }}
        />
      )}
    </>
  );
}

// -------------- Demo Seeder ------------------

// ---- Demo seeding helpers (page-local) ----
const LS_IDX = "reconciler.statements.index.v2";
const LS_CUR = "reconciler.statements.current.v2";
const LS_TX = "reconciler.tx.v1";
const LS_IN = "reconciler.inputs.v1";
const LS_DEMO_HASH = "reconciler.demoPayloadHash.v1";

type Snap = {
  id: string;
  label: string;
  stmtYear: number;
  stmtMonth: number;
  inputs: {
    beginningBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
  cachedTx: any[];
};

function buildDemoIndex(): Record<string, Snap> {
  const map: Record<string, Snap> = {};
  for (const m of DEMO_MONTHS) {
    map[m.id] = {
      id: m.id,
      label: m.label,
      stmtYear: m.stmtYear,
      stmtMonth: m.stmtMonth,
      inputs: {
        beginningBalance: m.inputs?.beginningBalance ?? 0,
        totalDeposits: m.inputs?.totalDeposits ?? 0,
        totalWithdrawals: m.inputs?.totalWithdrawals ?? 0,
      },
      cachedTx: Array.isArray(m.cachedTx) ? m.cachedTx : [],
    };
  }
  return map;
}

function payloadHash(): string {
  const s = JSON.stringify(DEMO_MONTHS);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `v${DEMO_VERSION}:${h}`;
}

/** Seeds LS and the provider on /demo routes before other effects run. */
function DemoSeeder() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { setTransactions, setInputs } = useReconcilerSelectors();

  React.useLayoutEffect(() => {
    if (!pathname?.startsWith("/demo")) return;

    const current = payloadHash();
    const stored = localStorage.getItem(LS_DEMO_HASH);
    const needSeed =
      stored !== current ||
      !localStorage.getItem(LS_IDX) ||
      !localStorage.getItem(LS_CUR) ||
      !localStorage.getItem(LS_TX) ||
      !localStorage.getItem(LS_IN);

    // Always (re)seed on payload change or missing keys
    if (needSeed) {
      const idx = buildDemoIndex();
      localStorage.setItem(LS_IDX, JSON.stringify(idx));

      // Select statement: ?statement -> env -> latest -> first
      const qp = search.get("statement") || undefined;
      const envId =
        (process.env.NEXT_PUBLIC_DEMO_MONTH as string | undefined) || undefined;
      const latest = DEMO_MONTHS.at(-1)?.id;
      const first = DEMO_MONTHS[0]?.id;
      const sel =
        (qp && idx[qp] ? qp : undefined) ??
        (envId && idx[envId] ? envId : undefined) ??
        latest ??
        first ??
        "";

      if (sel) {
        localStorage.setItem(LS_CUR, sel);
        const s = idx[sel];

        // Push into provider
        const rules = readCatRules();
        const raw = Array.isArray(s.cachedTx) ? s.cachedTx : [];
        const withRules = applyCategoryRulesTo(rules, raw, applyAlias);
        setTransactions(withRules);
        try {
          localStorage.setItem("reconciler.tx.v1", JSON.stringify(withRules));
        } catch {}

        setInputs({
          beginningBalance: s.inputs.beginningBalance ?? 0,
          totalDeposits: s.inputs.totalDeposits ?? 0,
          totalWithdrawals: s.inputs.totalWithdrawals ?? 0,
        });

        // Mirror caches for any other readers
        localStorage.setItem(LS_TX, JSON.stringify(s.cachedTx));
        localStorage.setItem(
          LS_IN,
          JSON.stringify({
            beginningBalance: s.inputs.beginningBalance ?? 0,
            totalDeposits: s.inputs.totalDeposits ?? 0,
            totalWithdrawals: s.inputs.totalWithdrawals ?? 0,
          })
        );
      }

      localStorage.setItem(LS_DEMO_HASH, current);
    } else {
      // If already seeded, ensure provider has same data as LS
      try {
        const tx = JSON.parse(localStorage.getItem(LS_TX) || "[]");
        const rules2 = readCatRules();
        const withRules2 = Array.isArray(tx)
          ? applyCategoryRulesTo(rules2, tx, applyAlias)
          : [];
        setTransactions(withRules2);
        const inputs = JSON.parse(localStorage.getItem(LS_IN) || "{}");

        if (inputs && typeof inputs === "object") setInputs(inputs);
      } catch {}
    }
    // only on route entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
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

    // Use ONLY starter categories (trim + dedupe, case-insensitive)
    const deduped = Array.from(
      new Set(
        starters
          .map((c) => (c?.name || "").trim())
          .filter(Boolean)
          .map((n) => n.toLowerCase())
      )
    ).map(
      (n) =>
        starters.find((c) => c.name?.toLowerCase() === n)?.name?.trim() || n
    );

    // Use whichever setter your provider exposes:
    if (typeof setAll === "function") setAll(deduped);
    else if (typeof setCategories === "function") setCategories(deduped);

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

  const ensureCategoryExists = useEnsureCategoryExists();

  const router = useRouter();
  const pathname = usePathname();
  const isDemo = pathname.startsWith("/demo");
  const searchParams = useSearchParams();
  const { singleUser, setupComplete } = useSpenders();
  const showUserCol = setupComplete && singleUser === false;

  const [headerBusy, setHeaderBusy] = React.useState(false);

  const [flashIds, setFlashIds] = React.useState<Set<string>>(new Set());
  const [liveMsg, setLiveMsg] = React.useState<string>("");
  const effectiveCat = React.useCallback(
    (r: TxRow) => (r.categoryOverride ?? r.category ?? "Uncategorized").trim(),
    []
  );

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
      if (isDemo) return; // ✅ no query param in demo
      const sp = new URLSearchParams(searchParams.toString());
      if (id) sp.set("statement", id);
      else sp.delete("statement");
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams, isDemo]
  );

  React.useEffect(() => {
    // migrate / bootstrap
    if (!isDemo) migrateLegacyIfNeeded();

    let idx = readIndex();

    if (!Object.keys(idx).length) {
      if (!isDemo) {
        // Non-demo: create an empty shell so the importer opens
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const id = makeId(y, m);
        const label = `${monthLabel(m)} ${y}`;
        upsertStatement(emptyStatement(id, label, y, m));
        idx = readIndex();
      } else {
        // DEMO: materialize demo statements so readIndex()/readCurrentId() work
        for (const m of DEMO_MONTHS) {
          upsertStatement({
            ...emptyStatement(m.id, m.label, m.stmtYear, m.stmtMonth),
            inputs: m.inputs,
            cachedTx: m.cachedTx,
            normalizerVersion: NORMALIZER_VERSION,
          });
        }
        idx = readIndex();
      }
    }

    setStatements(idx);

    // Pick initial statement id
    const initialUrlStatement = searchParams.get("statement");
    const fallbackDemoId =
      DEMO_MONTHS.at(-1)?.id ?? DEMO_MONTHS[0]?.id ?? Object.keys(idx)[0] ?? "";

    const cid =
      initialUrlStatement ||
      readCurrentId() ||
      Object.keys(idx)[0] ||
      (isDemo ? fallbackDemoId : "");

    setCurrentId(cid);
    if (!isDemo) setStatementInUrl(cid);

    const cur = idx[cid];

    setInputs(inputsFromStmt(cur));

    if (cur?.cachedTx?.length) {
      // ✅ Use demo/parsed snapshot when present
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, cur.cachedTx, applyAlias);
      setTransactions(txWithRules);
    } else if (cur?.pagesRaw?.length) {
      const pagesSanitized = (cur.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, cur.stmtYear, applyAlias);
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(txWithRules);
      if (!isDemo) ensureUpToDateParse(cur);
    } else {
      // Only open importer in non-demo; on demo, leave provider’s seeded rows alone
      if (!isDemo) {
        setTransactions([]);
        setOpenWizard(true);
      }
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

    setInputs(inputsFromStmt(s));

    if (s?.cachedTx?.length) {
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, s.cachedTx, applyAlias);
      setTransactions(txWithRules);
    } else if (s?.pagesRaw?.length) {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, s.stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(withRules);
      ensureUpToDateParse(s);
    } else {
      setTransactions([]);
      if (!isDemo) setOpenWizard(true);
    }
  }

  function afterWizardSaved(newId: string) {
    const idx = readIndex();
    setStatements(idx);
    setCurrentId(newId);
    setStatementInUrl(newId);

    const s = idx[newId];
    if (!s) return;

    setInputs(inputsFromStmt(s));

    if (s?.cachedTx?.length) {
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, s.cachedTx, applyAlias);
      setTransactions(txWithRules);
    } else if (s?.pagesRaw?.length) {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(
        pagesSanitized || [],
        s.stmtYear,
        applyAlias
      );
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(withRules);
    } else {
      setTransactions([]);
      if (!isDemo) setOpenWizard(true);
    }
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
      <DemoSeeder />
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
                    <tr
                      key={t.id}
                      className={`border-t border-slate-800 transition-colors ${
                        flashIds.has(t.id) ? "bg-emerald-900/30" : ""
                      }`}
                    >
                      <td className="p-2">{prettyDesc(t.description)}</td>
                      <td className="p-2">
                        <CategorySelect
                          value={
                            t.categoryOverride ?? t.category ?? "Uncategorized"
                          }
                          onChange={(val) => {
                            ensureCategoryExists(val); // keep

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

                            // Persist override & rule
                            writeOverride(k, val);
                            upsertCategoryRules(keys, val);

                            // BEFORE snapshot
                            const beforeById = new Map(
                              transactions.map((r) => [
                                r.id,
                                effectiveCat(r as any),
                              ])
                            );

                            // Recompute with rules and apply the explicit override to this row
                            const rules = readCatRules();
                            const updated = applyCategoryRulesTo(
                              rules,
                              transactions,
                              applyAlias
                            ).map((r) =>
                              r.id === t.id
                                ? { ...r, categoryOverride: val }
                                : r
                            );

                            // CHANGED ids
                            const changed = updated.filter(
                              (r) =>
                                beforeById.get(r.id) !== effectiveCat(r as any)
                            );
                            const changedIds = new Set(
                              changed.map((r) => r.id)
                            );

                            setTransactions(updated);

                            // Flash + aria-live toast
                            if (changedIds.size) {
                              setFlashIds(changedIds);
                              setLiveMsg(
                                `Applied “${val}” to ${
                                  changedIds.size
                                } transaction${changedIds.size > 1 ? "s" : ""}.`
                              );
                              window.setTimeout(
                                () => setFlashIds(new Set()),
                                1200
                              ); // remove highlight
                              window.setTimeout(() => setLiveMsg(""), 2500); // fade toast text
                            }
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

      <DemoReconcilerTips />

      {/* a11y: announce bulk changes */}
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>

      {/* optional lightweight toast */}
      {liveMsg && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2
                  px-3 py-1.5 rounded-lg border border-emerald-500/40
                  bg-emerald-900/40 text-emerald-100 text-sm shadow-lg"
        >
          {liveMsg}
        </div>
      )}
    </ProtectedRoute>
  );
}
