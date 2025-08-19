"use client";
import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { currentStatementMeta, type Period } from "@/lib/period";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import StatementSwitcher from "@/components/StatementSwitcher";
import {
  ShoppingCart,
  Utensils,
  Fuel,
  Home,
  Shield,
  Cable,
  MonitorPlay,
  CreditCard,
  ShoppingBag,
  PiggyBank,
  Music,
  Store,
  Sparkles,
} from "lucide-react";

import { useRowsForSelection } from "@/helpers/useRowsForSelection";
import { groupLabelForCategory } from "@/lib/categoryGroups";

/* ---------------------------- helpers & hooks ---------------------------- */

function useStatementOptions() {
  return React.useMemo(() => {
    const idx = readIndex();
    const entries = Object.values(idx)
      .map((s: any) => ({
        id: s.id,
        label: s.label,
        year: s.stmtYear,
        month: s.stmtMonth,
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
    return entries;
  }, []);
}

function usePeriodRows(period: Period, liveRows: any[]) {
  const meta = currentStatementMeta();
  return React.useMemo(() => {
    if (!meta || period === "CURRENT") return liveRows;
    const idx = readIndex();
    const rules = readCatRules();
    const all: any[] = [];
    for (const s of Object.values(idx)) {
      if (!s) continue;
      if (s.stmtYear !== meta.year) continue;
      if (s.stmtMonth > meta.month) continue;
      if (Array.isArray(s.cachedTx)) all.push(...s.cachedTx);
      else {
        const curId = readCurrentId();
        if (curId && s.id === curId) all.push(...liveRows);
      }
    }
    return applyCategoryRulesTo(rules, all, applyAlias) as typeof liveRows;
  }, [period, liveRows, meta]);
}

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);
const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

function iconFor(cat: string) {
  const c = cat.toLowerCase();
  if (/grocer/.test(c)) return <ShoppingCart className="h-5 w-5" />;
  if (/fast\s*food|dining|restaurant|coffee|food/.test(c))
    return <Utensils className="h-5 w-5" />;
  if (/gas|fuel/.test(c)) return <Fuel className="h-5 w-5" />;
  if (/housing|mortgage|rent|home/.test(c)) return <Home className="h-5 w-5" />;
  if (/utilities|utility|power|gas|water|internet/.test(c))
    return <Cable className="h-5 w-5" />;
  if (/insurance/.test(c)) return <Shield className="h-5 w-5" />;
  if (
    /subscriptions?|stream|music|video|prime|netflix|disney|hulu|plus/.test(c)
  )
    return <MonitorPlay className="h-5 w-5" />;
  if (/amazon|shopping|household|target|depot|store/.test(c))
    return <ShoppingBag className="h-5 w-5" />;
  if (/debt|loan|credit\s*card/.test(c))
    return <CreditCard className="h-5 w-5" />;
  if (/cash\s*back/.test(c)) return <PiggyBank className="h-5 w-5" />;
  if (/entertainment|movies|cinema/.test(c))
    return <Music className="h-5 w-5" />;
  if (/impulse|misc|uncategorized|other/.test(c))
    return <Sparkles className="h-5 w-5" />;
  return <Store className="h-5 w-5" />;
}

function accentFor(cat: string) {
  const c = cat.toLowerCase();
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
  if (/amazon|shopping|household|target|depot/.test(c))
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

/* --------------------------------- page ---------------------------------- */

export default function CategoriesIndexPage() {
  const { transactions } = useReconcilerSelectors();
  const options = useStatementOptions();

  // URL-driven statement sync
  const searchParams = useSearchParams();
  const urlStatement = searchParams.get("statement");
  React.useEffect(() => {
    if (!urlStatement) return;
    if (readCurrentId() !== urlStatement) writeCurrentId(urlStatement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatement]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const meta = currentStatementMeta();
  const savedId = mounted ? readCurrentId() : undefined;
  const selectedId: string = urlStatement ?? savedId ?? "";
  const [period, setPeriod] = React.useState<Period>("CURRENT");

  const viewRows = useRowsForSelection(period, selectedId, transactions);

  // Viewing chip should reflect the selected statement
  const viewMeta = React.useMemo(() => {
    if (!selectedId) return undefined;
    const idx = readIndex();
    return selectedId ? idx[selectedId] : undefined;
  }, [selectedId]);

  const catTotals = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of viewRows) {
      // Only count expenses positive for readability, like before
      const amt = r.amount < 0 ? Math.abs(r.amount) : 0;
      if (!amt) continue;

      const rawCat = (
        r.categoryOverride ??
        r.category ??
        "Uncategorized"
      ).trim();
      const top = groupLabelForCategory(rawCat); // <-- collapse Amazon family to "Amazon"
      m[top] = (m[top] ?? 0) + amt;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [viewRows]);

  const grandTotal = React.useMemo(
    () => catTotals.reduce((s, [, v]) => s + v, 0),
    [catTotals]
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="text-2xl font-bold">Categories</h1>

        {/* Avoid server/client mismatch: only show dynamic chip after mount */}
        {mounted && viewMeta && (
          <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
            Viewing:{" "}
            {period === "CURRENT"
              ? viewMeta.label
              : `YTD ${viewMeta.stmtYear} (Jan–${
                  viewMeta.label.split(" ")[0]
                })`}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Statement
          </span>
          <StatementSwitcher
            available={options.length ? options.map((o) => o.id) : undefined}
            showLabel={false}
            size="sm"
            className="w-44 sm:w-56"
          />

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

      {/* Cards grid (SSR-safe: skeleton until mounted) */}
      {!mounted ? (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
          suppressHydrationWarning
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              className="rounded-2xl border border-slate-700 bg-slate-900 p-4 animate-pulse"
            >
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-slate-800" />
                <div className="h-4 w-28 bg-slate-800 rounded" />
              </div>
              <div className="h-6 w-24 bg-slate-800 rounded mt-3" />
              <div className="h-2 w-full bg-slate-800 rounded mt-3" />
            </li>
          ))}
        </ul>
      ) : catTotals.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
          No transactions for this scope.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {catTotals.map(([cat, amt]) => {
            const pct = grandTotal ? Math.round((amt / grandTotal) * 100) : 0;
            const accent = accentFor(cat);
            const href = `/dashboard/category/${encodeURIComponent(
              toSlug(cat)
            )}${urlStatement ? `?statement=${urlStatement}` : ""}`;

            return (
              <li key={cat} className="group">
                <Link href={href} className="block focus:outline-none">
                  <div
                    className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                                transition-transform duration-150 will-change-transform
                                group-hover:translate-y-[-2px] group-hover:shadow-lg
                                bg-gradient-to-br ${accent}`}
                  >
                    {/* Icon + name */}
                    <div className="flex items-center gap-2">
                      <div className="shrink-0 rounded-xl bg-slate-950/60 border border-slate-700 p-2">
                        {iconFor(cat)}
                      </div>
                      <div className="font-medium truncate">{cat}</div>
                    </div>

                    {/* Amount */}
                    <div className="mt-2 text-lg sm:text-xl font-semibold">
                      {money(amt)}
                    </div>

                    {/* Percent bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Share of spend</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-white/70 group-hover:bg-white transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Click affordance */}
                    <div className="pointer-events-none absolute right-3 top-3 text-xs opacity-60 group-hover:opacity-100">
                      View →
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
