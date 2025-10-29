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
import { writeSummary, type Summary } from "@/lib/summaries";

// *** CANON ***
import { normalizeToCanonical } from "@/lib/categories/normalization";
import { ensureCategoryRulesSeededOnce } from "@/lib/categoryRules/seed";
import {
  CANON_BY_NAME,
  canonicalizeCategoryName,
} from "@/lib/categories/canon";
import { buildDisambiguatorPhrases } from "@/helpers/reconciler/disambiguators";
import {
  anyIntersect,
  merchantTokenSet,
  RULE_STOP_TOKENS,
} from "@/helpers/reconciler/tokenizer";
import { withCanonicalCategories } from "@/helpers/reconciler/reconciler-canon";
import { bulkApplyOverrideAcrossAllStatements } from "@/helpers/reconciler/reconciler-bulk";
import { summarizeMonth } from "@/helpers/reconciler/reconciler-summary";
import { maybeAutoFixInputs } from "@/helpers/reconciler/reconciler-inputs";
import { Panel, ToolbarButton } from "@/helpers/reconciler/ui";
import { DemoSeeder } from "@/helpers/reconciler/demo-seeder";

/* --- tiny UI bits --- */
if (typeof window !== "undefined")
  (window as any).__FOREVIAN_RECON_VER__ = "recon-2025-09-10a";

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);

/* ---------------- Safer merchant bulk-apply helpers ---------------- */

function filterSafeTokenRules(rawKeys: string[]): string[] {
  // Only keep token keys, drop any that are too generic, and de-dupe.
  const out = new Set<string>();
  for (const k of rawKeys) {
    if (!k.startsWith("tok:")) continue;
    const tok = k.slice(4).toLowerCase();
    if (tok.length <= 3) continue;
    if (RULE_STOP_TOKENS.has(tok)) continue;
    out.add(k);
  }
  return Array.from(out);
}

/* --- helpers --- */

/** Allow category creation everywhere (Demo + non-Demo) */
export function useEnsureCategoryExists() {
  const { categories, setAll } = useCategories(); // Category[]

  return React.useCallback(
    (label: string) => {
      const chosen = canonicalizeCategoryName(label);
      const canon = CANON_BY_NAME[chosen];

      // If it's one of our canonical categories, ensure that exact one exists
      if (canon) {
        const exists =
          categories.some((c) => c.name === canon.name) ||
          categories.some((c) => c.slug === canon.slug);
        if (!exists) {
          setAll([
            ...categories,
            {
              id:
                crypto.randomUUID?.() ??
                `cat-${Math.random().toString(36).slice(2)}`,
              name: canon.name,
              icon: canon.icon,
              color: canon.color,
              hint: canon.hint,
              slug: canon.slug,
            },
          ]);
        }
        return;
      }

      // Otherwise this is a truly custom category — add once
      const name = (label || "").trim();
      if (!name) return;

      const slug = catToSlug(name);
      const existsCustom =
        categories.some((c) => c.name.toLowerCase() === name.toLowerCase()) ||
        categories.some((c) => c.slug === slug);

      if (!existsCustom) {
        setAll([
          ...categories,
          {
            id:
              crypto.randomUUID?.() ??
              `cat-${Math.random().toString(36).slice(2)}`,
            name,
            icon: "🗂️",
            color: "#475569",
            hint: "",
            slug,
          },
        ]);
      }
    },
    [categories, setAll]
  );
}

const inputsFromStmt = (s?: StatementSnapshot) => ({
  beginningBalance: s?.inputs?.beginningBalance ?? 0,
  totalDeposits: s?.inputs?.totalDeposits ?? 0,
  totalWithdrawals: s?.inputs?.totalWithdrawals ?? 0,
});

/* --- page --- */

export default function ReconcilerPage() {
  const uid = useAuthUID();
  const { categories, findBySlug, findByNameCI } = useCategories() as any;

  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  // NEW: seed baseline rules at bootstrap for non-demo as well
  React.useEffect(() => {
    ensureCategoryRulesSeededOnce();
  }, []);

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
    // Already up to date → no work
    if ((s.normalizerVersion ?? 0) >= NORMALIZER_VERSION) return s;

    // No raw pages → nothing to reparse
    if (!Array.isArray(s.pagesRaw) || s.pagesRaw.length === 0) return s;

    // SAFETY: If we already have cachedTx, don't auto-reparse a reconciled month
    if (Array.isArray(s.cachedTx) && s.cachedTx.length > 0) return s;

    setHeaderBusy(true);
    try {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, s.stmtYear, applyAlias);

      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***

      const updated: StatementSnapshot = {
        ...s,
        cachedTx: normalized,
        normalizerVersion: NORMALIZER_VERSION,
      };
      upsertStatement(updated);
      setStatements(readIndex());
      setTransactions(normalized); // *** CANON ***

      // Align inputs if the header scrape was YTD/garbage on fresh imports
      maybeAutoFixInputs(updated, normalized, (next) =>
        setInputs(inputsFromStmt(next))
      );

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

  // debounce write to avoid spamming Firestore while user is editing
  const writeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueSummaryWrite = React.useCallback(() => {
    if (!uid || isDemo || !currentId) return; // only for real users, not demo
    if (!transactions?.length) return; // nothing to persist
    const idx = readIndex();
    if (!idx[currentId]) return; // safety

    if (writeTimer.current) clearTimeout(writeTimer.current);

    // helper
    const pad2 = (n: number) => String(n).padStart(2, "0");
    writeTimer.current = setTimeout(async () => {
      try {
        const idx = readIndex();
        const snap = idx[currentId];
        if (!snap) return;

        const monthId = `${snap.stmtYear}-${pad2(snap.stmtMonth)}`; // <-- normalized key

        const summary = summarizeMonth(monthId, transactions, inputs);
        await writeSummary(uid, monthId, summary);
      } catch (e) {
        console.warn("writeSummary failed", e);
      }
    }, 600);
  }, [uid, isDemo, currentId, transactions, inputs]);

  React.useEffect(() => {
    queueSummaryWrite();
  }, [queueSummaryWrite]);

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
      const withRules = applyCategoryRulesTo(rules, cur.cachedTx, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
      maybeAutoFixInputs(cur, normalized, (next) =>
        setInputs(inputsFromStmt(next))
      );
    } else if (Array.isArray(cur?.pagesRaw) && cur.pagesRaw.length) {
      const pagesSanitized = (cur.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, cur.stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
      maybeAutoFixInputs(cur, normalized, (next) =>
        setInputs(inputsFromStmt(next))
      );
      if (!isDemo) ensureUpToDateParse(cur);
    } else {
      setTransactions([]);
      if (!isDemo) setOpenWizard(true);
    }

    bootstrapped.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isDemo]);

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
      const withRules = applyCategoryRulesTo(rules, cur.cachedTx, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
    } else if (cur?.pagesRaw?.length) {
      const pagesSanitized = (cur.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, cur.stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
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
      const withRules = applyCategoryRulesTo(rules, s.cachedTx, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
    } else if (s?.pagesRaw?.length) {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, s.stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
      maybeAutoFixInputs(s, normalized, (next) =>
        setInputs(inputsFromStmt(next))
      );
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
      const withRules = applyCategoryRulesTo(rules, s.cachedTx, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
    } else if (s?.pagesRaw?.length) {
      const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(
        pagesSanitized || [],
        s.stmtYear,
        applyAlias
      );
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
      setTransactions(normalized);
      maybeAutoFixInputs(s, normalized, (next) =>
        setInputs(inputsFromStmt(next))
      );
    } else {
      setTransactions([]);
      queueSummaryWrite();
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
                                const aliasLabel =
                                  applyAlias(
                                    stripAuthAndCard(t.description || "")
                                  ) ?? "";
                                const rawKeys = candidateKeys(
                                  t.description || "",
                                  aliasLabel
                                );

                                // 1) Keep only safe token keys (no generic collisions)
                                const tokenKeys = filterSafeTokenRules(rawKeys);

                                // 2) Add brand-specific phrase keys for disambiguation
                                const phraseKeys = buildDisambiguatorPhrases(
                                  t.description || "",
                                  aliasLabel
                                );

                                // Persist a per-tx override for this one row
                                const k = keyForTx(
                                  t.date || "",
                                  t.description || "",
                                  t.amount ?? 0
                                );
                                writeOverride(k, label);

                                // Save rules: tokens (tagged), plus phrases (untyped = phrase/auto)
                                if (tokenKeys.length)
                                  upsertCategoryRules(
                                    tokenKeys,
                                    label,
                                    "token"
                                  );
                                if (phraseKeys.length)
                                  upsertCategoryRules(phraseKeys, label);

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
                                // *** CANON ***
                                updated = withCanonicalCategories(updated, {
                                  isDemo,
                                });

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

                                // Also stamp overrides across ALL statements for this merchant
                                bulkApplyOverrideAcrossAllStatements(
                                  t.description || "",
                                  label,
                                  isDemo
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
