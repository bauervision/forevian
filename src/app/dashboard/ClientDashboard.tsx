"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import DemoDashboardTips from "@/components/DemoDashboardTips";
import StatementSwitcher from "@/components/StatementSwitcher";

import { computeTotals } from "@/lib/metrics";
import { type Period } from "@/lib/period";
import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  type StatementSnapshot,
} from "@/lib/statements";
import {
  useSelectedStatementId,
  useClientSearchParam,
} from "@/lib/useClientSearchParams";
import { useSyncSelectedStatement } from "@/lib/useSyncSelectedStatement";

import { applyCategoryRulesTo, readCatRules } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { catToSlug } from "@/lib/slug";
import { iconForCategory } from "@/lib/icons";
import { User, User2, HelpCircle } from "lucide-react";

/* ---------------------------- helpers & hooks ---------------------------- */

function useIsDemo() {
  const p = usePathname();
  return p?.startsWith("/demo") ?? false;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => USD.format(n);

const spenderAccent = (who: string) => {
  const w = (who || "").toLowerCase();
  if (w === "husband" || w === "mike")
    return "from-sky-600/20 to-sky-500/5 border-sky-500";
  if (w === "wife" || w === "beth")
    return "from-fuchsia-600/20 to-fuchsia-500/5 border-fuchsia-500";
  return "from-slate-600/20 to-slate-500/5 border-slate-500";
};

const spenderIcon = (who: string, className = "h-6 w-6") => {
  const w = (who || "").toLowerCase();
  if (w === "husband" || w === "mike") return <User className={className} />;
  if (w === "wife" || w === "beth") return <User2 className={className} />;
  return <HelpCircle className={className} />;
};

const slugSpender = (s: string) => (s || "").toLowerCase();

const kpiAccent = (
  accent: "green" | "red" | "neutral" | "violet" | "amber" = "neutral"
) => {
  switch (accent) {
    case "green":
      return "from-emerald-600/20 to-emerald-500/5 border-emerald-500";
    case "red":
      return "from-rose-600/20 to-rose-500/5 border-rose-500";
    case "violet":
      return "from-violet-600/20 to-violet-500/5 border-violet-500";
    case "amber":
      return "from-amber-600/20 to-amber-500/5 border-amber-500";
    default:
      return "from-slate-600/20 to-slate-500/5 border-slate-500";
  }
};

// lightweight accent util (reuse your category look)
function accentFor(cat: string) {
  const c = (cat || "").toLowerCase();
  if (/grocer/.test(c))
    return "from-emerald-600/20 to-emerald-500/5 border-emerald-500";
  if (/fast\s*food|dining|restaurant/.test(c))
    return "from-orange-600/20 to-orange-500/5 border-orange-500";
  if (/gas|fuel/.test(c))
    return "from-amber-600/20 to-amber-500/5 border-amber-500";
  if (/housing|mortgage|rent/.test(c))
    return "from-cyan-600/20 to-cyan-500/5 border-cyan-500";
  if (/utilities|utility/.test(c))
    return "from-sky-600/20 to-sky-500/5 border-sky-500";
  if (/insurance/.test(c))
    return "from-teal-600/20 to-teal-500/5 border-teal-500";
  if (/subscriptions?/.test(c))
    return "from-violet-600/20 to-violet-500/5 border-violet-500";
  if (/amazon|shopping|household|target|depot|store/.test(c))
    return "from-pink-600/20 to-pink-500/5 border-pink-500";
  if (/debt|loan|credit\s*card/.test(c))
    return "from-rose-600/20 to-rose-500/5 border-rose-500";
  if (/entertainment|movies|cinema/.test(c))
    return "from-fuchsia-600/20 to-fuchsia-500/5 border-fuchsia-500";
  if (/cash\s*back/.test(c))
    return "from-emerald-600/20 to-emerald-500/5 border-emerald-500";
  if (/impulse|misc|uncategorized|other/.test(c))
    return "from-slate-600/20 to-slate-500/5 border-slate-500";
  return "from-rose-600/20 to-rose-500/5 border-rose-500";
}

function hasData(s?: StatementSnapshot) {
  return !!(
    (Array.isArray(s?.cachedTx) && s!.cachedTx.length > 0) ||
    (Array.isArray(s?.pagesRaw) && s!.pagesRaw.length > 0)
  );
}

function pickBestStatementId(
  selectedFromUrl: string | null,
  isDemo: boolean
): string {
  const idx = readIndex();
  if (!isDemo && selectedFromUrl && idx[selectedFromUrl])
    return selectedFromUrl;

  const saved = readCurrentId();
  if (saved && idx[saved]) return saved;

  const sorted = Object.values(idx).sort(
    (a, b) => b.stmtYear - a.stmtYear || b.stmtMonth - a.stmtMonth
  );
  const withData = sorted.filter(hasData);
  return withData[0]?.id || sorted[0]?.id || "";
}

function buildRowsForCurrent(id: string) {
  const idx = readIndex();
  const cur = idx[id];
  if (!cur) return [] as any[];
  const rules = readCatRules();

  // Prefer cachedTx; if none (rare on dashboard), just empty (wizard handles parsing elsewhere)
  const base = Array.isArray(cur.cachedTx) ? cur.cachedTx : [];
  return applyCategoryRulesTo(rules, base, applyAlias);
}

function buildRowsForYTD(id: string) {
  const idx = readIndex();
  const cur = idx[id];
  if (!cur) return [] as any[];
  const rules = readCatRules();

  const rows: any[] = [];
  for (const s of Object.values(idx)) {
    if (!s) continue;
    if (s.stmtYear !== cur.stmtYear) continue;
    if (s.stmtMonth > cur.stmtMonth) continue;
    if (Array.isArray(s.cachedTx)) rows.push(...s.cachedTx);
  }
  return applyCategoryRulesTo(rules, rows, applyAlias);
}

/* --------------------------------- page ---------------------------------- */

export default function ClientDashboard() {
  useSyncSelectedStatement();

  const isDemo = useIsDemo();
  const base = isDemo ? "/demo" : "";
  const router = useRouter();

  const selectedFromUrl = useSelectedStatementId();
  const [effectiveId, setEffectiveId] = React.useState<string>("");

  // Keep inputs in sync for totals calc
  const { inputs, setInputs } = useReconcilerSelectors();

  // Choose an id that actually exists & has data
  React.useEffect(() => {
    const id = pickBestStatementId(selectedFromUrl, isDemo);
    if (!id) return;
    if (id !== effectiveId) setEffectiveId(id);

    // mirror/persist for cross-page cohesion
    if (id !== readCurrentId()) writeCurrentId(id);
    if (!isDemo && typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("statement", id);
      router.replace(u.pathname + "?" + u.searchParams.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFromUrl, isDemo]);

  // Sync inputs from the selected statement (for computeTotals' beginning balance)
  React.useEffect(() => {
    if (!effectiveId) return;
    const s = readIndex()[effectiveId];
    if (!s) return;
    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });
  }, [effectiveId, setInputs]);

  const options = React.useMemo(() => {
    const idx = readIndex();
    return Object.values(idx)
      .map((s: any) => ({
        id: s.id,
        label: s.label,
        year: s.stmtYear,
        month: s.stmtMonth,
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }, [effectiveId]); // light refresh after selection changes

  const [period, setPeriod] = React.useState<Period>("CURRENT");

  const viewRows = React.useMemo(() => {
    if (!effectiveId) return [] as any[];
    return period === "YTD"
      ? buildRowsForYTD(effectiveId)
      : buildRowsForCurrent(effectiveId);
  }, [effectiveId, period]);

  // True Spend excludes Transfers, Debt, Cash Back
  const trueSpend = React.useMemo(() => {
    const EXCLUDE = new Set(["Transfers", "Debt", "Cash Back"]);
    return viewRows
      .filter((r) => r.amount < 0)
      .filter(
        (r) =>
          !EXCLUDE.has(
            (r.categoryOverride ?? r.category ?? "Uncategorized").trim()
          )
      )
      .reduce((s, r) => s + Math.abs(r.amount), 0);
  }, [viewRows]);

  const cashBack = React.useMemo(
    () =>
      viewRows
        .filter(
          (r) =>
            ((r.categoryOverride ?? r.category) || "").trim().toLowerCase() ===
            "cash back"
        )
        .reduce((s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0), 0),
    [viewRows]
  );

  // Spender mapping (demo vs real names)
  const CARD_TO_SPENDER = React.useMemo<Record<string, string>>(
    () =>
      isDemo
        ? { "5280": "Husband", "0161": "Wife" }
        : { "5280": "Mike", "0161": "Beth" },
    [isDemo]
  );

  const bySpender = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of viewRows) {
      if (r.amount >= 0) continue;
      const explicit = (r.user || "").trim();
      const who =
        explicit ||
        (r.cardLast4 ? CARD_TO_SPENDER[r.cardLast4] : undefined) ||
        "Joint";
      map[who] = (map[who] ?? 0) + Math.abs(r.amount);
    }
    return map;
  }, [viewRows, CARD_TO_SPENDER]);

  const topCats = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of viewRows) {
      if (r.amount >= 0) continue;
      const cat = (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
      m[cat] = (m[cat] ?? 0) + Math.abs(r.amount);
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [viewRows]);

  const totals = React.useMemo(
    () =>
      computeTotals(
        viewRows,
        period === "YTD" ? 0 : inputs.beginningBalance ?? 0
      ),
    [viewRows, inputs, period]
  );

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>

          {effectiveId && (
            <StatementSwitcher
              // keep the switcher in agreement with our chosen id
              // (works with/without value/onChange in your current implementation)
              // @ts-ignore — supports controlled or URL/LS driven usage
              value={effectiveId}
              onChange={(id: string) => setEffectiveId(id)}
              available={options.length ? options.map((o) => o.id) : undefined}
              showLabel={false}
              size="sm"
              className="w-44 sm:w-56"
            />
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm">Period:</span>
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
              <button
                className={`px-3 py-1 text-sm ${
                  period === "CURRENT"
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-slate-900"
                }`}
                onClick={() => setPeriod("CURRENT")}
              >
                Current
              </button>
              <button
                className={`px-3 py-1 text-sm ${
                  period === "YTD"
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-slate-900"
                }`}
                onClick={() => setPeriod("YTD")}
              >
                YTD
              </button>
            </div>
          </div>
        </div>

        {/* Top KPI row: Deposits | Net | True Spend | Cash Back */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Deposits"
            value={money(totals.income)}
            accent="green"
          />
          <KpiCard
            label="Net"
            value={money(totals.income - totals.expense)}
            accent={totals.income - totals.expense >= 0 ? "green" : "red"}
          />
          <KpiCard
            label="True Spend"
            value={money(trueSpend)}
            accent="red"
            hint="Excludes Transfers, Debt, Cash Back"
          />
          <KpiCard label="Cash Back" value={money(cashBack)} accent="green" />
        </section>

        {/* Spend by Spender */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <h3 className="font-semibold mb-2">Spend by Spender</h3>

          {Object.keys(bySpender).length === 0 ? (
            <div className="text-sm text-slate-400">
              No spenders in this scope.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {Object.entries(bySpender)
                .sort((a, b) => b[1] - a[1])
                .map(([who, amt]) => {
                  const accent = spenderAccent(who);
                  const href = `${base}/dashboard/spender/${encodeURIComponent(
                    slugSpender(who)
                  )}${
                    !isDemo && effectiveId ? `?statement=${effectiveId}` : ""
                  }`;
                  return (
                    <li key={who} className="group">
                      <Link href={href} className="block focus:outline-none">
                        <div
                          className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                    transition-transform duration-150 will-change-transform
                    group-hover:-translate-y-0.5 group-hover:shadow-lg
                    bg-gradient-to-br ${accent}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center shrink-0">
                              {spenderIcon(who)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-base font-semibold text-white truncate">
                                {who}
                              </div>
                              <div className="text-lg sm:text-xl font-semibold">
                                {money(amt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        {/* Top Categories */}
        <section>
          <h3 className="font-semibold mb-2">Top Categories (Expenses)</h3>
          {topCats.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
              No expense categories for this scope.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {topCats.map(([cat, amt]) => {
                const accent = accentFor(cat);
                const href = `${base}/dashboard/category/${encodeURIComponent(
                  catToSlug(cat)
                )}${effectiveId ? `?statement=${effectiveId}` : ""}`;
                return (
                  <li key={cat} className="group">
                    <Link href={href} className="block focus:outline-none">
                      <div
                        className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                  transition-transform duration-150 will-change-transform
                  group-hover:-translate-y-0.5 group-hover:shadow-lg
                  bg-gradient-to-br ${accent}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-14 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center shrink-0">
                            {iconForCategory(cat, "h-6 w-6")}
                          </div>
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-white truncate">
                              {cat}
                            </div>
                            <div className="text-lg sm:text-xl font-semibold">
                              {money(amt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <DemoDashboardTips />
    </ProtectedRoute>
  );
}

/* ------------------------------ UI elements ------------------------------ */

function KpiCard({
  label,
  value,
  hint,
  accent = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "green" | "red" | "neutral" | "violet" | "amber";
}) {
  return (
    <div
      className={`rounded-2xl border border-l-4 p-4
                  bg-slate-900 bg-gradient-to-br ${kpiAccent(accent)}`}
    >
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-xs text-slate-300/80 mt-1">{hint}</div>}
    </div>
  );
}
