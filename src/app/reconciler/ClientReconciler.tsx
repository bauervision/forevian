// app/reconciler/page.tsx
"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  upsertStatement,
  emptyStatement,
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
import { coerceToSlug } from "@/lib/categories/helpers";
import { TxRow } from "@/lib/types";
import { useSpenders } from "@/lib/spenders";

import { useAuthUID } from "@/lib/fx";
import DemoReconcilerTips from "../../components/DemoReconcilerTips";
import { DEMO_MONTHS, DEMO_VERSION } from "@/app/demo/data";
import { applyAlias } from "@/lib/aliases";

import {
  useClientSearchParam,
  useSelectedStatementId,
} from "@/lib/useClientSearchParams";
import CategorySelect from "@/components/CategorySelect";
import { resolveAliasNameToCategory } from "@/lib/categories/aliases";
import { catToSlug } from "@/lib/slug";
import { AnimatePresence, motion } from "framer-motion";
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

/* ---------------- Safer merchant bulk-apply helpers ---------------- */

const GENERIC_TOKENS = new Set([
  "store",
  "market",
  "supermarket",
  "mart",
  "fuel",
  "gas",
  "station",
  "pharmacy",
  "shop",
  "online",
  "purchase",
  "payment",
  "services",
  "service",
  "llc",
  "inc",
  "the",
]);

function merchantTokenSet(desc: string) {
  const alias = applyAlias(stripAuthAndCard(desc || ""));
  const keys = candidateKeys(desc || "", alias);
  const toks = new Set<string>();
  for (const k of keys) {
    if (!k.startsWith("tok:")) continue;
    const tok = k.slice(4).toLowerCase();
    if (tok.length <= 3) continue;
    if (GENERIC_TOKENS.has(tok)) continue;
    toks.add(tok);
  }
  return toks;
}

function anyIntersect(a: Set<string>, b: Set<string>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/* -------------- Demo Seeder ------------------ */

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

  const { setTransactions, setInputs } = useReconcilerSelectors();
  const qp = useClientSearchParam("statement") || undefined;

  React.useLayoutEffect(() => {
    if (!pathname?.startsWith("/demo")) return;

    // DEMO default token rules so big brands aren't Uncategorized
    upsertCategoryRules(["tok:starbucks", "tok:sbux"], "Dining", "token");

    const current = payloadHash();
    const stored = localStorage.getItem(LS_DEMO_HASH);
    const needSeed =
      stored !== current ||
      !localStorage.getItem(LS_IDX) ||
      !localStorage.getItem(LS_CUR) ||
      !localStorage.getItem(LS_TX) ||
      !localStorage.getItem(LS_IN);

    if (needSeed) {
      const idx = buildDemoIndex();
      localStorage.setItem(LS_IDX, JSON.stringify(idx));

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
      const rules2 = readCatRules();
      try {
        const tx = JSON.parse(localStorage.getItem(LS_TX) || "[]");
        const withRules2 = Array.isArray(tx)
          ? applyCategoryRulesTo(rules2, tx, applyAlias)
          : [];
        setTransactions(withRules2);
        const inputs = JSON.parse(localStorage.getItem(LS_IN) || "{}");
        if (inputs && typeof inputs === "object") setInputs(inputs);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

/* --- helpers --- */

/** Allow category creation everywhere (Demo + non-Demo) */
export function useEnsureCategoryExists() {
  const { categories, setAll } = useCategories(); // Category[]

  return React.useCallback(
    (label: string) => {
      const existing = resolveAliasNameToCategory(label, categories);
      if (existing) return;

      const name = (label || "").trim();
      if (!name) return;

      const newCat = {
        id:
          crypto.randomUUID?.() ?? `cat-${Math.random().toString(36).slice(2)}`,
        name,
        icon: "🗂️",
        color: "#475569",
        hint: "",
        slug: catToSlug(name),
      };

      setAll([...categories, newCat]);
    },
    [categories, setAll]
  );
}

const inputsFromStmt = (s?: StatementSnapshot) => ({
  beginningBalance: s?.inputs?.beginningBalance ?? 0,
  totalDeposits: s?.inputs?.totalDeposits ?? 0,
  totalWithdrawals: s?.inputs?.totalWithdrawals ?? 0,
});

/** Recompute one statement with current rules (helper used during boot/switch) */
function recomputeOneWithRules(s: StatementSnapshot) {
  const rules = readCatRules();
  let txs = s.cachedTx ?? [];
  if ((!txs || !txs.length) && Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
    const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
    const res = rebuildFromPages(pagesSanitized, s.stmtYear, applyAlias);
    txs = res.txs;
  }
  const withRules = applyCategoryRulesTo(rules, txs, applyAlias);
  const nextSnap: StatementSnapshot = {
    ...s,
    cachedTx: withRules,
    normalizerVersion: Math.max(NORMALIZER_VERSION, s.normalizerVersion ?? 0),
  };
  upsertStatement(nextSnap);
  return nextSnap;
}

/** NEW: brute-force override across ALL statements that match merchant tokens */
function bulkApplyOverrideAcrossAllStatements(
  anchorDesc: string,
  label: string
) {
  const anchorTokens = merchantTokenSet(anchorDesc || "");
  if (!anchorTokens.size) return;

  const idx = readIndex();
  const rules = readCatRules();

  for (const id of Object.keys(idx)) {
    const s = idx[id];

    // Start from rules-applied snapshot to stay in sync with current rules
    const snap = recomputeOneWithRules(s);
    const txs = Array.isArray(snap.cachedTx) ? snap.cachedTx : [];

    // Find candidates in this statement by token intersection
    const candidates = txs.filter(
      (r) =>
        (r.amount ?? 0) < 0 &&
        (r.description || "").trim() &&
        anyIntersect(anchorTokens, merchantTokenSet(r.description || ""))
    );

    if (!candidates.length) continue;

    const idSet = new Set(candidates.map((r) => r.id));
    const updated = txs.map((r) =>
      idSet.has(r.id) ? { ...r, categoryOverride: label } : r
    );

    const nextSnap: StatementSnapshot = {
      ...snap,
      cachedTx: updated,
      normalizerVersion: Math.max(
        NORMALIZER_VERSION,
        snap.normalizerVersion ?? 0
      ),
    };
    upsertStatement(nextSnap);
  }
}

/* --- page --- */

export default function ReconcilerPage() {
  const uid = useAuthUID();
  const { categories, findBySlug, findByNameCI } = useCategories() as any;

  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  const ensureCategoryExists = useEnsureCategoryExists();

  const router = useRouter();

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

  const { applyAlias: applyAliasFromProvider } = useAliases();
  React.useEffect(() => {
    (window as any).__applyAlias = applyAliasFromProvider;
  }, [applyAliasFromProvider]);

  const { transactions, setTransactions, inputs, setInputs } =
    useReconcilerSelectors();

  const [statements, setStatements] = React.useState<
    Record<string, StatementSnapshot>
  >({});
  const [currentId, setCurrentId] = React.useState<string>("");

  const [openWizard, setOpenWizard] = React.useState(false);

  const setStatementInUrl = React.useCallback(
    (nextId?: string) => {
      if (isDemo) return;

      const current =
        typeof window === "undefined" ? "" : window.location.search;
      const sp = new URLSearchParams(current);

      if (nextId) sp.set("statement", nextId);
      else sp.delete("statement");

      const qs = sp.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;

      router.replace(href);
    },
    [isDemo, pathname, router]
  );

  const selectedId = useSelectedStatementId(); // string | null

  const bootstrapped = React.useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;

    if (!isDemo) migrateLegacyIfNeeded();

    let idx = readIndex();

    if (!Object.keys(idx).length) {
      if (!isDemo) {
        setStatements({});
        setTransactions([]);
        setInputs({
          beginningBalance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
        });
        setOpenWizard(true);
        bootstrapped.current = true;
        return;
      } else {
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

    const hasData = (s: any) =>
      (Array.isArray(s?.cachedTx) && s.cachedTx.length > 0) ||
      (Array.isArray(s?.pagesRaw) && s.pagesRaw.length > 0);

    const sorted = Object.values(idx).sort(
      (a: any, b: any) => b.stmtYear - a.stmtYear || b.stmtMonth - a.stmtMonth
    );
    const withData = sorted.filter(hasData);

    const saved = readCurrentId();
    const savedOk = saved && idx[saved];

    const cid =
      selectedId ||
      (savedOk ? saved : "") ||
      withData[0]?.id ||
      sorted[0]?.id ||
      "";

    setCurrentId(cid);
    writeCurrentId(cid);
    if (!isDemo) setStatementInUrl(cid);

    const cur = idx[cid];
    setInputs(inputsFromStmt(cur));

    if (Array.isArray(cur?.cachedTx) && cur.cachedTx.length) {
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, cur.cachedTx, applyAlias);
      setTransactions(txWithRules);
    } else if (Array.isArray(cur?.pagesRaw) && cur.pagesRaw.length) {
      const pagesSanitized = (cur.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, cur.stmtYear, applyAlias);
      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(txWithRules);
      if (!isDemo) ensureUpToDateParse(cur);
    } else {
      setTransactions([]);
      if (!isDemo) setOpenWizard(true);
    }

    bootstrapped.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isDemo]);

  useEffect(() => {
    const next = selectedId ?? "";
    if (!next || next === currentId) return;
    onSwitchStatement(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!currentId) return;
    const idx = readIndex();
    setStatements(idx);

    const cur = idx[currentId];
    if (!cur) {
      const fallback = Object.keys(idx)[0] ?? "";
      setCurrentId(fallback);
      writeCurrentId(fallback);
      if (!isDemo) setStatementInUrl(fallback);
      setTransactions([]);
      setInputs({} as any);
      return;
    }

    setInputs(inputsFromStmt(cur));

    if (cur?.cachedTx?.length) {
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
      setTransactions([]);
      if (!isDemo) setOpenWizard(true);
    }

    writeCurrentId(currentId);
    if (!isDemo) setStatementInUrl(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, isDemo, applyAlias]);

  const urlStatement = useClientSearchParam("statement") ?? "";
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

  const hasData = (s: any) =>
    (Array.isArray(s?.cachedTx) && s.cachedTx.length > 0) ||
    (Array.isArray(s?.pagesRaw) && s.pagesRaw.length > 0);

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
              value={currentId}
              onChange={(id) => setCurrentId(id)}
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
                        {(() => {
                          const currentSlug = coerceToSlug(
                            t.categoryOverride ?? t.category ?? "Uncategorized",
                            categories,
                            findBySlug,
                            findByNameCI
                          );

                          return (
                            <CategorySelect
                              value={currentSlug}
                              onChange={(slug) => {
                                const picked = findBySlug(slug);
                                const label = picked?.name ?? "Uncategorized";

                                // Ensure category exists globally
                                ensureCategoryExists(label);

                                // Stable merchant keys from description
                                const aliasLabel = applyAlias(
                                  stripAuthAndCard(t.description || "")
                                );
                                const keys = candidateKeys(
                                  t.description || "",
                                  aliasLabel
                                );
                                const tokenKeys = keys.filter((k) =>
                                  k.startsWith("tok:")
                                );

                                // Persist a per-tx override for this one row
                                const k = keyForTx(
                                  t.date || "",
                                  t.description || "",
                                  t.amount ?? 0
                                );
                                writeOverride(k, label);

                                // Save TOKEN rules (still useful)
                                if (tokenKeys.length) {
                                  upsertCategoryRules(
                                    tokenKeys,
                                    label,
                                    "token"
                                  );
                                }

                                // BEFORE snapshot for highlight
                                const beforeById = new Map(
                                  transactions.map((r) => [
                                    r.id,
                                    effectiveCat(r as any),
                                  ])
                                );

                                // Re-run current table first for instant feedback
                                const rules = readCatRules();
                                let updated = applyCategoryRulesTo(
                                  rules,
                                  transactions,
                                  applyAlias
                                );

                                // Apply explicit override for this clicked row in the view
                                updated = updated.map((r) =>
                                  r.id === t.id
                                    ? { ...r, categoryOverride: label }
                                    : r
                                );

                                // Bulk apply same-merchant within *this* view (nice UX)
                                const anchorTokens = merchantTokenSet(
                                  t.description || ""
                                );
                                if (anchorTokens.size) {
                                  const allWithdrawals = updated.filter(
                                    (r) => (r.amount ?? 0) < 0
                                  );
                                  const candidates = allWithdrawals.filter(
                                    (r) =>
                                      r.id !== t.id &&
                                      (r.description || "").trim() &&
                                      anyIntersect(
                                        anchorTokens,
                                        merchantTokenSet(r.description || "")
                                      )
                                  );

                                  const MAX_BULK = 24;
                                  const MAX_SHARE = 0.5;
                                  const withinCap =
                                    candidates.length <= MAX_BULK &&
                                    candidates.length <=
                                      Math.floor(
                                        allWithdrawals.length * MAX_SHARE
                                      );

                                  if (withinCap) {
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

                                const changed = updated.filter(
                                  (r) =>
                                    beforeById.get(r.id) !==
                                    effectiveCat(r as any)
                                );
                                const changedIds = new Set(
                                  changed.map((r) => r.id)
                                );

                                setTransactions(updated);

                                // Persist current statement snapshot
                                try {
                                  const idx = readIndex();
                                  const snap = idx[currentId];
                                  if (snap) {
                                    const nextSnap: StatementSnapshot = {
                                      ...snap,
                                      cachedTx: updated,
                                      normalizerVersion: Math.max(
                                        NORMALIZER_VERSION,
                                        snap.normalizerVersion ?? 0
                                      ),
                                    };
                                    upsertStatement(nextSnap);
                                    setStatements(readIndex());
                                  }
                                } catch {}

                                // **THE FIX**: hard-stamp overrides across ALL statements now
                                bulkApplyOverrideAcrossAllStatements(
                                  t.description || "",
                                  label
                                );

                                if (changedIds.size) {
                                  setFlashIds(changedIds);
                                  setLiveMsg(
                                    `Applied “${label}” to ${
                                      changedIds.size
                                    } transaction${
                                      changedIds.size > 1 ? "s" : ""
                                    } (this view).`
                                  );
                                  window.setTimeout(
                                    () => setFlashIds(new Set()),
                                    1200
                                  );
                                  window.setTimeout(() => setLiveMsg(""), 2500);
                                }
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
            <table className="w-full text-sm min-w={[420].toString()}">
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

      {/* toast: animated, top-right */}
      <AnimatePresence>
        {liveMsg && (
          <div className="fixed top-4 right-4 z-50 pointer-events-none">
            <motion.div
              key={liveMsg}
              initial={{ opacity: 0, x: 64 }} // start off-screen to the right
              animate={{ opacity: 1, x: 0 }} // slide in to position
              exit={{ opacity: 0, x: 64 }} // slide back out to the right
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 32,
                mass: 0.7,
              }}
              className="pointer-events-auto px-3 py-1.5 rounded-lg border border-emerald-500/40
                   bg-emerald-900/40 text-emerald-100 text-sm shadow-lg"
              role="status"
              aria-live="polite"
            >
              {liveMsg}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ProtectedRoute>
  );
}
