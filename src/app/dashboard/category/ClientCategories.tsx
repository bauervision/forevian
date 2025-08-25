"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  Pencil,
} from "lucide-react";
import CategoryManagerDialog from "@/components/CategoryManagerDialog";
import { useRowsForSelection } from "@/helpers/useRowsForSelection";
import { groupLabelForCategory } from "@/lib/categoryGroups";
import { catToSlug } from "@/lib/slug";
import ProtectedRoute from "@/components/ProtectedRoute";

// NEW: pull in categories provider setters
import { useCategories } from "@/app/providers/CategoriesProvider";

/* ---------------------------- helpers & hooks ---------------------------- */

function useIsDemo() {
  const p = usePathname();
  return p?.startsWith("/demo") ?? false;
}

/** Find the previous statement id for a given "YYYY-MM" that actually exists. */
function prevStatementId(currentId?: string | null) {
  if (!currentId) return null;
  const [y, m] = currentId.split("-").map(Number);
  if (!y || !m) return null;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const candidate = `${py.toString().padStart(4, "0")}-${pm
    .toString()
    .padStart(2, "0")}`;
  const idx = readIndex();
  return idx[candidate] ? candidate : null;
}

/** Simple MoM trend */
function computeTrend(curr: number, prev: number) {
  if (!prev && !curr) return { dir: "flat" as const, pct: 0, delta: 0 };
  if (!prev && curr) return { dir: "up" as const, pct: 100, delta: curr };
  const delta = curr - prev;
  const pct = Math.round((delta / prev) * 100);
  return delta > 0
    ? { dir: "up" as const, pct, delta }
    : delta < 0
    ? { dir: "down" as const, pct, delta }
    : { dir: "flat" as const, pct: 0, delta: 0 };
}

/** Tiny pill for trend */
function TrendPill({
  dir,
  pct,
  deltaMoney,
}: {
  dir: "up" | "down" | "flat";
  pct: number;
  deltaMoney: string;
}) {
  const up = dir === "up";
  const down = dir === "down";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border
        ${
          up
            ? "text-rose-300 border-rose-500/60 bg-rose-900/20"
            : down
            ? "text-emerald-300 border-emerald-500/60 bg-emerald-900/20"
            : "text-slate-300 border-slate-600 bg-slate-800/40"
        }`}
      title={`${deltaMoney} vs last month`}
    >
      {up ? "▲" : down ? "▼" : "–"} {Math.abs(pct)}%
    </span>
  );
}

/** Keep options in sync with storage (reseed/reset) */
function useStatementOptions() {
  const [opts, setOpts] = React.useState<
    Array<{ id: string; label: string; year: number; month: number }>
  >([]);

  React.useEffect(() => {
    const refresh = () => {
      const idx = readIndex();
      const entries = Object.values(idx)
        .map((s: any) => ({
          id: s.id,
          label: s.label,
          year: s.stmtYear,
          month: s.stmtMonth,
        }))
        .sort((a, b) => a.year - b.year || a.month - b.month);
      setOpts(entries);
    };
    refresh();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "reconciler.statements.index.v2") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return opts;
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
  if (/grocer/.test(c)) return <ShoppingCart className="h-6 w-6" />;
  if (/fast\s*food|dining|restaurant|coffee|food/.test(c))
    return <Utensils className="h-6 w-6" />;
  if (/gas|fuel/.test(c)) return <Fuel className="h-6 w-6" />;
  if (/housing|mortgage|rent|home/.test(c)) return <Home className="h-6 w-6" />;
  if (/utilities|utility|power|gas|water|internet/.test(c))
    return <Cable className="h-6 w-6" />;
  if (/insurance/.test(c)) return <Shield className="h-6 w-6" />;
  if (
    /subscriptions?|stream|music|video|prime|netflix|disney|hulu|plus/.test(c)
  )
    return <MonitorPlay className="h-6 w-6" />;
  if (/amazon|shopping|household|target|depot|store/.test(c))
    return <ShoppingBag className="h-6 w-6" />;
  if (/debt|loan|credit\s*card/.test(c))
    return <CreditCard className="h-6 w-6" />;
  if (/cash\s*back/.test(c)) return <PiggyBank className="h-6 w-6" />;
  if (/entertainment|movies|cinema/.test(c))
    return <Music className="h-6 w-6" />;
  if (/impulse|misc|uncategorized|other/.test(c))
    return <Sparkles className="h-6 w-6" />;
  return <Store className="h-6 w-6" />;
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

export default function ClientCategories() {
  const isDemo = useIsDemo();
  const base = isDemo ? "/demo" : "";

  const { transactions, setInputs } = useReconcilerSelectors();
  const { setAll, setCategories } = useCategories() as any; // NEW setters
  const options = useStatementOptions();
  const [openMgr, setOpenMgr] = React.useState(false);

  // URL-driven statement sync (only sync storage; keep demo URL clean)
  const searchParams = useSearchParams();
  const urlStatement = searchParams.get("statement");
  React.useEffect(() => {
    if (!urlStatement) return;
    if (readCurrentId() !== urlStatement) writeCurrentId(urlStatement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatement]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // NEW: while in demo, derive categories from demo statements and push to provider
  React.useEffect(() => {
    if (!isDemo) return;

    const idx = readIndex();
    const names = new Set<string>();
    for (const s of Object.values(idx) as any[]) {
      const rows = Array.isArray(s?.cachedTx) ? s.cachedTx : [];
      for (const r of rows) {
        const c = (r.categoryOverride ?? r.category ?? "").trim();
        if (c) names.add(c);
      }
    }
    const list = Array.from(names)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const i = list.findIndex((x) => x.toLowerCase() === "uncategorized");
    if (i >= 0) {
      const [u] = list.splice(i, 1);
      list.push(u === "Uncategorized" ? u : "Uncategorized");
    }
    if (typeof setAll === "function") setAll(list);
    else if (typeof setCategories === "function") setCategories(list);
  }, [isDemo, options.length, setAll, setCategories]);

  const meta = currentStatementMeta();
  const savedId = mounted ? readCurrentId() : undefined;
  const selectedId: string = urlStatement ?? savedId ?? "";

  React.useEffect(() => {
    if (!selectedId) return;
    const s = readIndex()[selectedId];
    if (!s) return;
    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });
  }, [selectedId, setInputs]);

  const [period, setPeriod] = React.useState<Period>("CURRENT");

  const viewRows = useRowsForSelection(period, selectedId, transactions);

  // previous month rows (MoM)
  const prevRows = React.useMemo(() => {
    if (period !== "CURRENT") return [] as typeof viewRows;
    const idx = readIndex();
    const selected = (searchParams.get("statement") ?? readCurrentId()) || "";
    const prevId = prevStatementId(selected);
    if (!prevId) return [];
    const s = idx[prevId];
    if (!s) return [];
    const rules = readCatRules();
    const raw = Array.isArray(s.cachedTx) ? s.cachedTx : [];
    return applyCategoryRulesTo(rules, raw, applyAlias) as typeof viewRows;
  }, [period, searchParams]);

  // Viewing chip should reflect the selected statement
  const viewMeta = React.useMemo(() => {
    if (!selectedId) return undefined;
    const idx = readIndex();
    return selectedId ? idx[selectedId] : undefined;
  }, [selectedId]);

  // Build current + previous totals keyed by top-level category (group label)
  const catCards = React.useMemo(() => {
    const sumByTop = (rows: any[]) => {
      const m: Record<string, number> = {};
      for (const r of rows) {
        const amt = r.amount < 0 ? Math.abs(r.amount) : 0;
        if (!amt) continue;
        const rawCat = (
          r.categoryOverride ??
          r.category ??
          "Uncategorized"
        ).trim();
        const top = groupLabelForCategory(rawCat);
        m[top] = (m[top] ?? 0) + amt;
      }
      return m;
    };
    const curr = sumByTop(viewRows);
    const prev = sumByTop(prevRows);

    return Object.entries(curr)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        trend: computeTrend(value, prev[name] ?? 0),
      }));
  }, [viewRows, prevRows]);

  const grandTotal = React.useMemo(
    () => catCards.reduce((s, c) => s + c.value, 0),
    [catCards]
  );

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-2xl font-bold">Categories</h1>

          {/* Edit Categories button */}
          <button
            type="button"
            onClick={() => setOpenMgr(true)}
            className="h-9 px-3 rounded-2xl border text-sm bg-slate-900 border-slate-700 hover:bg-slate-800 inline-flex items-center gap-2"
            title="Edit Categories"
          >
            <Pencil className="h-4 w-4" />
            Edit Categories
          </button>

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

        {/* Cards grid */}
        {!mounted ? (
          <ul
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
            suppressHydrationWarning
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <li
                key={i}
                className="rounded-2xl border border-slate-700 bg-slate-900 p-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-xl bg-slate-800" />
                  <div className="h-4 w-28 bg-slate-800 rounded" />
                </div>
                <div className="h-6 w-24 bg-slate-800 rounded mt-3" />
                <div className="h-4 w-20 bg-slate-800 rounded mt-2" />
              </li>
            ))}
          </ul>
        ) : catCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
            No transactions for this scope.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {catCards.map(({ name, value, trend }) => {
              const pct = grandTotal
                ? Math.round((value / grandTotal) * 100)
                : 0;
              const accent = accentFor(name);
              const href = `${base}/dashboard/category/${encodeURIComponent(
                catToSlug(name)
              )}${urlStatement && !isDemo ? `?statement=${urlStatement}` : ""}`;

              return (
                <li key={name} className="group">
                  <Link href={href} className="block focus:outline-none">
                    <div
                      className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                        transition-transform duration-150 will-change-transform
                        group-hover:-translate-y-0.5 group-hover:shadow-lg
                        bg-gradient-to-br ${accent}`}
                    >
                      {/* Header row: icon + name (no amount here) */}
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center shrink-0">
                          {iconFor(name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold text-white truncate">
                            {name}
                          </div>
                          <div className="text-xs text-slate-300">
                            {pct}% of spend
                          </div>
                        </div>
                      </div>

                      {/* Amount + trend row */}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-lg sm:text-xl font-semibold">
                          {money(value)}
                        </div>
                        <TrendPill
                          dir={trend.dir}
                          pct={trend.pct}
                          deltaMoney={money(Math.abs(trend.delta))}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <CategoryManagerDialog open={openMgr} onClose={() => setOpenMgr(false)} />
    </ProtectedRoute>
  );
}
