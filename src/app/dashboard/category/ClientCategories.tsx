"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import StatementSwitcher from "@/components/StatementSwitcher";
import CategoryManagerDialog from "@/components/CategoryManagerDialog";
import DemoCategoriesTips from "@/components/DemoCategoriesTips";

import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { Category, useCategories } from "@/app/providers/CategoriesProvider";

import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  type StatementSnapshot,
} from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { useSelectedStatementId } from "@/lib/useClientSearchParams";
import { useSyncSelectedStatement } from "@/lib/useSyncSelectedStatement";
import { catToSlug } from "@/lib/slug";
import { demoCategoryHref } from "@/app/demo/slug-helpers";

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

import { prettyDesc } from "@/lib/txEnrich";

/* ---------- export helpers (category grouping + loose date parse) ---------- */

type Tx = {
  id?: string;
  date?: string;
  description?: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
  user?: string;
  cardLast4?: string;
};

function parseDateLoose(s?: string): Date | null {
  if (!s) return null;
  const p = Date.parse(s);
  if (!Number.isNaN(p)) return new Date(p);
  const mdy = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (mdy) {
    const mm = +mdy[1],
      dd = +mdy[2];
    const yy = mdy[3] ? +mdy[3] : new Date().getFullYear();
    const yyyy = yy < 100 ? 2000 + yy : yy;
    return new Date(yyyy, mm - 1, dd, 12);
  }
  return null;
}

function catNameOf(r: Tx) {
  return (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
}

/* ---------------------------- helpers & hooks ---------------------------- */

function useIsDemo() {
  const p = usePathname();
  return p?.startsWith("/demo") ?? false;
}

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);

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

/** Find the previous existing statement id relative to an id like "YYYY-MM". */
function prevStatementId(fromId?: string | null) {
  if (!fromId) return null;
  const [y, m] = fromId.split("-").map(Number);
  if (!y || !m) return null;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const cand = `${String(py).padStart(4, "0")}-${String(pm).padStart(2, "0")}`;
  const idx = readIndex();
  return idx[cand] ? cand : null;
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

type Period = "CURRENT" | "YTD";

export default function ClientCategories() {
  useSyncSelectedStatement(); // keep cross-page cohesion

  const isDemo = useIsDemo();
  const router = useRouter();

  const selectedFromUrl = useSelectedStatementId();
  const [effectiveId, setEffectiveId] = React.useState<string>("");

  // inputs for compute/consistency (some cards may use balances later)
  const { setInputs } = useReconcilerSelectors();

  const [exportOpen, setExportOpen] = React.useState(false);

  function doPrintSoon() {
    requestAnimationFrame(() => setTimeout(() => window.print(), 50));
  }

  // choose a valid id (most-recent WITH DATA)
  React.useEffect(() => {
    const id = pickBestStatementId(selectedFromUrl, isDemo);
    if (!id) return;
    if (id !== effectiveId) setEffectiveId(id);

    // persist + reflect in URL (non-demo)
    if (id !== readCurrentId()) writeCurrentId(id);
    if (!isDemo && typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("statement", id);
      router.replace(u.pathname + "?" + u.searchParams.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFromUrl, isDemo]);

  // ensure inputs reflect selected statement (if needed elsewhere)
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

  // options for the switcher (show all statements; default selection logic already prefers data)
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
  }, [effectiveId]);

  // categories from provider
  const { categories = [] } = useCategories() as { categories: Category[] };

  const [openMgr, setOpenMgr] = React.useState(false);
  const [period, setPeriod] = React.useState<Period>("CURRENT");

  // rows for CURRENT / YTD
  const viewRows = React.useMemo(() => {
    if (!effectiveId) return [] as any[];
    return period === "YTD"
      ? buildRowsForYTD(effectiveId)
      : buildRowsForCurrent(effectiveId);
  }, [effectiveId, period]);

  // previous rows for trend (previous existing statement)
  const prevRows = React.useMemo(() => {
    if (period !== "CURRENT" || !effectiveId) return [] as any[];
    const prevId = prevStatementId(effectiveId);
    if (!prevId) return [] as any[];
    return buildRowsForCurrent(prevId);
  }, [period, effectiveId]);

  // selected statement meta for chip
  const viewMeta = React.useMemo(() => {
    if (!effectiveId) return undefined;
    const idx = readIndex();
    return idx[effectiveId];
  }, [effectiveId]);

  // Build totals by category (aligned to provider categories via slug/name)
  const catCards = React.useMemo(() => {
    const bySlug = new Map(
      categories.map((c) => [(c.slug || "").toLowerCase(), c] as const)
    );
    const byName = new Map(
      categories.map((c) => [c.name.toLowerCase(), c] as const)
    );
    const uncategorized =
      categories.find((c) => c.name.toLowerCase() === "uncategorized") ??
      categories[0];

    const makeSums = (rows: any[]) => {
      const sums = new Map<string, number>(); // key = provider slug (lowercase)
      for (const r of rows) {
        const rawName = String(
          (r.categoryOverride ?? r.category ?? "Uncategorized") || ""
        ).trim();
        const amt = r.amount < 0 ? Math.abs(r.amount) : 0;
        if (!amt) continue;

        const slug = catToSlug(rawName);
        const cat =
          bySlug.get(slug) ||
          byName.get(rawName.toLowerCase()) ||
          uncategorized;
        const key = (cat.slug || "uncategorized").toLowerCase();
        sums.set(key, (sums.get(key) ?? 0) + amt);
      }
      return sums;
    };

    const currentSums = makeSums(viewRows);
    const prevSums = makeSums(prevRows);

    const allSlugs = new Set<string>([
      ...currentSums.keys(),
      ...prevSums.keys(),
    ]);

    return Array.from(allSlugs)
      .map((slug) => {
        const cat = bySlug.get(slug)!;
        const total = currentSums.get(slug) ?? 0;
        const prev = prevSums.get(slug) ?? 0;
        const trend = computeTrend(total, prev);
        return { cat, total, prev, trend };
      })
      .sort((a, b) => b.total - a.total);
  }, [categories, viewRows, prevRows]);

  const grandTotal = React.useMemo(
    () => catCards.reduce((s, c) => s + c.total, 0),
    [catCards]
  );

  // key for dialog to re-mount cleanly after structure changes
  const mgrKey = React.useMemo(
    () =>
      `mgr-${categories.length}-${categories
        .map((c) => c.id || c.slug || c.name)
        .join("|")}`,
    [categories]
  );

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-2xl font-bold">Categories</h1>

          <button
            type="button"
            onClick={() => setOpenMgr(true)}
            className="h-9 px-3 rounded-2xl border text-sm bg-slate-900 border-slate-700 hover:bg-slate-800 inline-flex items-center gap-2"
            title="Edit Categories"
          >
            <Pencil className="h-4 w-4" />
            Edit Categories
          </button>

          {viewMeta && (
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
              // controlled selection so the switcher really switches this page
              // @ts-ignore – supports both controlled/URL-driven in your implementation
              value={effectiveId}
              onChange={(id: string) => {
                setEffectiveId(id);
                writeCurrentId(id);
                if (!isDemo && typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.set("statement", id);
                  router.replace(u.pathname + "?" + u.searchParams.toString());
                }
              }}
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

            <div className="relative">
              <button
                className="h-9 px-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm"
                onClick={() => {
                  setExportOpen((v) => !v);
                }}
                aria-expanded={exportOpen}
              >
                Export as PDF
              </button>

              {exportOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-lg z-10">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm"
                    onClick={() => {
                      setExportOpen(false);
                      doPrintSoon();
                    }}
                  >
                    Export current view (statement/period)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        {catCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
            No transactions for this scope.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {catCards.map(({ cat, total, trend }) => {
              const pct = grandTotal
                ? Math.round((total / grandTotal) * 100)
                : 0;
              const accent = accentFor(cat.name);
              const slug = catToSlug(cat.name);

              const href = isDemo
                ? demoCategoryHref(slug, effectiveId)
                : `/dashboard/category/${encodeURIComponent(slug)}${
                    effectiveId
                      ? `?statement=${encodeURIComponent(effectiveId)}`
                      : ""
                  }`;

              return (
                <li key={cat.name} className="group">
                  <Link href={href} className="block focus:outline-none">
                    <div
                      className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                        transition-transform duration-150 will-change-transform
                        group-hover:-translate-y-0.5 group-hover:shadow-lg
                        bg-gradient-to-br ${accent}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center shrink-0">
                          {iconFor(cat.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold text-white truncate">
                            {cat.name}
                          </div>
                          <div className="text-xs text-slate-300">
                            {pct}% of spend
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-lg sm:text-xl font-semibold">
                          {money(total)}
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

      {openMgr && (
        <CategoryManagerDialog
          key={mgrKey}
          open
          onClose={() => setOpenMgr(false)}
        />
      )}

      <DemoCategoriesTips />

      {/* -------- Print Layout (only visible during print) -------- */}
      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }
          nav,
          header,
          footer,
          .no-print,
          .router-progress {
            display: none !important;
          }
          .print-container {
            display: block !important;
            color: #000;
          }
          .print-page {
            page-break-after: always;
          }
          a::after {
            content: "" !important;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th,
          td {
            border: 1px solid #999;
            padding: 6px 8px;
            font-size: 12px;
          }
          th {
            background: #eee;
          }
          h1,
          h2,
          h3 {
            margin: 0 0 8px;
          }
          .muted {
            color: #444;
          }
          .tot {
            font-weight: 600;
          }
        }
        @media screen {
          .print-container {
            display: none;
          }
        }
      `}</style>

      {(() => {
        // rows already reflect CURRENT or YTD for the selected statement
        const allRows = viewRows as Tx[];

        // expenses only
        const expRows = allRows.filter((r) => r.amount < 0);

        // bucket by category name (string)
        const byCat = new Map<string, { total: number; items: Tx[] }>();
        for (const r of expRows) {
          const cat = catNameOf(r);
          const g = byCat.get(cat) ?? { total: 0, items: [] };
          const amt = Math.abs(r.amount);
          g.total += amt;
          g.items.push(r);
          byCat.set(cat, g);
        }

        // sorted list of categories by total desc
        const catList = Array.from(byCat.entries())
          .map(([name, v]) => ({ name, total: v.total, items: v.items }))
          .sort((a, b) => b.total - a.total);

        // header text
        const scope = viewMeta
          ? period === "CURRENT"
            ? viewMeta.label
            : `YTD ${viewMeta.stmtYear}`
          : period === "CURRENT"
          ? "Current Statement"
          : "YTD";

        return (
          <div className="print-container">
            {/* Cover / summary page */}
            <section className="print-page">
              <h1>Expenses Report</h1>
              <div className="muted" style={{ marginBottom: 12 }}>
                Forevian Finance • {new Date().toLocaleDateString()}
              </div>
              <h2>{scope} • All Categories</h2>
              <p className="tot" style={{ marginTop: 12 }}>
                Grand Total: {money(grandTotal)}
              </p>

              <h3 style={{ marginTop: 16 }}>Category Totals</h3>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "60%" }}>Category</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {catList.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td style={{ textAlign: "right" }}>{money(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Per-category detail pages */}
            {catList.map((c) => (
              <section key={c.name} className="print-page">
                <h2>{c.name}</h2>
                <p className="tot" style={{ marginBottom: 8 }}>
                  Total: {money(c.total)}
                </p>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th>Description</th>
                      <th style={{ width: 110, textAlign: "right" }}>Amount</th>
                      <th style={{ width: 90 }}>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.items
                      .slice()
                      .sort(
                        (a, b) =>
                          (parseDateLoose(a.date)?.getTime() ?? 0) -
                          (parseDateLoose(b.date)?.getTime() ?? 0)
                      )
                      .map((r, i) => (
                        <tr key={`${r.id || "row"}-${i}`}>
                          <td>{r.date || ""}</td>
                          <td>{prettyDesc(r.description || "")}</td>
                          <td style={{ textAlign: "right" }}>
                            {money(Math.abs(r.amount))}
                          </td>
                          <td>
                            {(r.user || "").trim() ||
                              (typeof r.cardLast4 === "string"
                                ? r.cardLast4
                                : "")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        );
      })()}
    </ProtectedRoute>
  );
}
