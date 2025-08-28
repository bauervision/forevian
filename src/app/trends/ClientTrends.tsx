"use client";
import React from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useCategories } from "@/app/providers/CategoriesProvider";
import { readIndex, readCurrentId } from "@/lib/statements";
import {
  readCatRules,
  applyCategoryRulesTo,
  type TxLike as RulesTxLike,
} from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { catToSlug } from "@/lib/slug";
import { groupLabelForCategory } from "@/lib/categoryGroups";
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
import { usePathname } from "next/navigation";
import DemoTrendsTips from "@/components/DemoTrendsTips";

/* ------------------------ types & utils ------------------------ */

type TxLike = {
  id: string;
  date?: string;
  description?: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
};

type MonthBucket = {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  spendByCategory: Record<string, number>; // categoryName -> sum(outflows)
};

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);

function keyFor(y: number, m: number) {
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
}
function prettyMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}
function lastDelta(arr: number[]) {
  if (!arr.length) return { last: 0, delta: 0, pct: 0, prev: 0 };
  const last = arr[arr.length - 1] ?? 0;
  const prev = arr.length > 1 ? arr[arr.length - 2] ?? 0 : 0;
  const delta = last - prev;
  const pct = prev ? (delta / prev) * 100 : last ? 100 : 0;
  return { last, delta, pct, prev };
}

/* ------------------------ icons & accents ------------------------ */

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

/** Tiny inline sparkline (no extra deps) */
function MiniSpark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * 100;
      const y = 100 - (Math.abs(v) / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-8 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-slate-300"
      />
    </svg>
  );
}

/* ------------------------ data assembly ------------------------ */

/** Build monthly spend from statements (rules + aliases applied). Uses exact category names (not grouped). */
function buildMonthlyFromStatements(): MonthBucket[] {
  const idx = readIndex();
  const rules = readCatRules();
  const buckets = new Map<string, MonthBucket>();

  for (const s of Object.values(idx) as any[]) {
    const rowsRaw: any[] = Array.isArray(s?.cachedTx) ? s.cachedTx : [];
    if (!rowsRaw.length) continue;

    const prepared: RulesTxLike[] = rowsRaw.map((r) => ({
      id: String(r.id ?? crypto.randomUUID()),
      date: String(r.date ?? ""), // required string
      description: String(r.description ?? ""), // required string
      amount: Number(r.amount ?? 0),
      category: r.category ? String(r.category) : undefined,
      categoryOverride: r.categoryOverride
        ? String(r.categoryOverride)
        : undefined,
    }));

    const applied = applyCategoryRulesTo(
      rules,
      prepared,
      applyAlias
    ) as TxLike[];

    const y = Number(s.stmtYear);
    const m = Number(s.stmtMonth);
    const key = keyFor(y, m);
    const bucket = buckets.get(key) || {
      key,
      year: y,
      month: m,
      spendByCategory: {},
    };

    for (const t of applied) {
      const amt = Number(t.amount ?? 0);
      if (amt >= 0) continue; // track outflows only
      const cat = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
      bucket.spendByCategory[cat] =
        (bucket.spendByCategory[cat] ?? 0) + Math.abs(amt);
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
}

/** Series for exact categories */
function seriesForCategories(months: MonthBucket[], cats: string[]) {
  return cats.map((label) => ({
    label,
    x: months.map((m) => m.key),
    y: months.map((m) => m.spendByCategory[label] ?? 0),
  }));
}

/* ---------------------------------- page ---------------------------------- */

export default function ClientTrendsPage() {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;
  const base = isDemo ? "/demo" : "";

  const { categories: sourceCats } = useCategories(); // source of truth
  const allMonths = React.useMemo(() => buildMonthlyFromStatements(), []);

  // Filter months by period
  const months = React.useMemo(() => {
    if (!allMonths.length) return [];
    const nowId = readCurrentId();
    const now = new Date();
    const yearRef = (() => {
      if (!nowId) return now.getFullYear();
      const [y] = nowId.split("-").map(Number);
      return y || now.getFullYear();
    })();
    return allMonths.filter((m) => m.year === yearRef);
  }, [allMonths]);

  // Observed categories from data
  const observedCats = React.useMemo(() => {
    const set = new Set<string>();
    for (const m of allMonths)
      for (const k of Object.keys(m.spendByCategory)) set.add(k);
    return Array.from(set);
  }, [allMonths]);

  // Union with source-of-truth categories
  const allCatsUnion = React.useMemo(() => {
    const set = new Set<string>();
    sourceCats.forEach((c) =>
      set.add((c || "").trim()).add(groupLabelForCategory(c || ""))
    ); // ensure top labels exist too
    observedCats.forEach((c) => set.add((c || "").trim()));
    // Remove empties
    set.delete("");
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [sourceCats, observedCats]);

  // Initial selection: prefer some common ones if present; else top-3 from latest month; else first 3 from union
  const [cats, setCats] = React.useState<string[]>(() => {
    const defaults = ["Utilities", "Fast Food", "Dining"];
    const seeded = defaults.filter(
      (d) => observedCats.includes(d) || sourceCats.includes(d)
    );
    if (seeded.length) return seeded;
    const last = allMonths[allMonths.length - 1];
    if (last) {
      const top3 = Object.entries(last.spendByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);
      if (top3.length) return top3;
    }
    return allCatsUnion.slice(0, 3);
  });

  const series = React.useMemo(
    () => seriesForCategories(months, cats),
    [months, cats]
  );

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-2xl font-bold">Trends</h1>
          <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
            {months.length} month{months.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Category picker (union of source-of-truth + observed) */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Categories</h3>
            <div className="text-xs text-slate-400">Select up to ~8</div>
          </div>
          {allCatsUnion.length === 0 ? (
            <div className="text-sm text-slate-400">
              No categories yet. Import a statement to get started.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allCatsUnion.map((c) => {
                const active = cats.includes(c);
                return (
                  <button
                    key={c}
                    className={[
                      "px-3 py-1 rounded-xl border text-sm transition-colors",
                      active
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "border-slate-700 text-slate-200 hover:bg-slate-800",
                    ].join(" ")}
                    onClick={() =>
                      setCats((prev) =>
                        active
                          ? prev.filter((x) => x !== c)
                          : prev.length >= 8
                          ? prev
                          : [...prev, c]
                      )
                    }
                  >
                    {c}
                  </button>
                );
              })}
              {cats.length > 0 && (
                <button
                  onClick={() => setCats([])}
                  className="ml-1 px-3 py-1 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </section>

        {/* Cards per selected category */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {series.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
              No trend data in this period.
            </div>
          ) : (
            series.map((s) => {
              const vals = s.y;
              const { last, delta, pct } = lastDelta(vals);
              const up = delta > 0;
              const lastLabel = months.length
                ? prettyMonth(months[months.length - 1].key)
                : "";
              const prevLabel =
                months.length > 1
                  ? prettyMonth(months[months.length - 2].key)
                  : "";
              const accent = accentFor(s.label);

              // Link to the *group* page for consistency with your Category details route
              const topGroup = groupLabelForCategory(s.label);
              const href = `${base}/dashboard/category/${encodeURIComponent(
                catToSlug(topGroup)
              )}`;

              return (
                <Link
                  key={s.label}
                  href={href}
                  className="block focus:outline-none"
                >
                  <div
                    className={[
                      "relative rounded-2xl border bg-slate-900 border-l-4 p-4",
                      "transition-transform duration-150 will-change-transform",
                      "hover:-translate-y-0.5 hover:shadow-lg",
                      "bg-gradient-to-br",
                      accent,
                    ].join(" ")}
                  >
                    {/* Header row: icon + name */}
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-xl bg-slate-950/60 border border-slate-700 grid place-items-center shrink-0">
                        {iconFor(s.label)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold text-white truncate">
                          {s.label}
                        </div>
                        <div className="text-[11px] text-slate-300">
                          Latest: {lastLabel}
                        </div>
                      </div>
                    </div>

                    {/* Value + sparkline */}
                    <div className="mt-3 grid grid-cols-5 gap-3 items-end">
                      <div className="col-span-2">
                        <div className="text-lg sm:text-xl font-semibold">
                          {money(last)}
                        </div>
                        <div
                          className={[
                            "text-xs",
                            up ? "text-rose-300" : "text-emerald-300",
                          ].join(" ")}
                        >
                          {up ? "▲" : "▼"} {money(Math.abs(delta))} (
                          {pct.toFixed(1)}%) vs {prevLabel || "prior"}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <MiniSpark values={vals} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </section>
      </div>

      <DemoTrendsTips />
    </ProtectedRoute>
  );
}
