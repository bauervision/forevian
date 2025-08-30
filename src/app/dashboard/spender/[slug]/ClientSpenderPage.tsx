"use client";
import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { type Period } from "@/lib/period";
import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  type StatementSnapshot,
} from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { prettyDesc } from "@/lib/txEnrich";
import { useBrandMap } from "@/app/providers/BrandMapProvider";
import { IconFromKey } from "@/lib/icons";
import {
  ArrowLeft,
  HelpCircle,
  Store as StoreIcon,
  User,
  User2,
  Pencil,
} from "lucide-react";
import BrandLogoDialog from "@/components/BrandLogoDialog";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  useClientSearchParam,
  useSelectedStatementId,
} from "@/lib/useClientSearchParams";
import { useSyncSelectedStatement } from "@/lib/useSyncSelectedStatement";
import StatementSwitcher from "@/components/StatementSwitcher";
import { normalizePageText } from "@/lib/textNormalizer";
import { rebuildFromPages } from "@/lib/import/reconcile";

/* ----------------------------- helpers ---------------------------------- */

function useIsDemo() {
  const p = usePathname();
  return p?.startsWith("/demo") ?? false;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const normalizeSlugToSpender = (slug: string) => {
  const v = (slug || "").toLowerCase();
  if (v === "mike") return "Mike";
  if (v === "beth") return "Beth";
  if (v === "husband") return "Husband";
  if (v === "wife") return "Wife";
  if (v === "you") return "You";
  if (v === "spouse") return "Spouse";
  if (v === "primary") return "Primary";
  if (v === "secondary") return "Secondary";
  return "Joint";
};

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

  let base: any[] = [];
  if (Array.isArray(cur.cachedTx) && cur.cachedTx.length) {
    base = cur.cachedTx;
  } else if (Array.isArray(cur.pagesRaw) && cur.pagesRaw.length) {
    const sanitized = cur.pagesRaw.map(normalizePageText);
    const res = rebuildFromPages(sanitized, cur.stmtYear, applyAlias);
    base = res.txs;
  }

  const rules = readCatRules();
  return applyCategoryRulesTo(rules, base, applyAlias);
}

function buildRowsForYTD(id: string) {
  const idx = readIndex();
  const cur = idx[id];
  if (!cur) return [] as any[];
  const rules = readCatRules();

  const rows: any[] = [];
  const sameYear = Object.values(idx).filter(
    (s) => s && s.stmtYear === cur.stmtYear && s.stmtMonth <= cur.stmtMonth
  );
  for (const s of sameYear) {
    let base: any[] = [];
    if (Array.isArray(s.cachedTx) && s.cachedTx.length) base = s.cachedTx;
    else if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
      const sanitized = s.pagesRaw.map(normalizePageText);
      const res = rebuildFromPages(sanitized, s.stmtYear, applyAlias);
      base = res.txs;
    }
    if (base.length) rows.push(...base);
  }
  return applyCategoryRulesTo(rules, rows, applyAlias);
}

function prevStatementId(currentId?: string | null) {
  if (!currentId) return null;
  const [y, m] = currentId.split("-").map(Number);
  if (!y || !m) return null;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const cand = `${String(py).padStart(4, "0")}-${String(pm).padStart(2, "0")}`;
  const idx = readIndex();
  return idx[cand] ? cand : null;
}

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

function TrendBadgeLarge({
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
  const base =
    "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm font-medium border";
  const tone = up
    ? "text-rose-200 border-rose-500/60 bg-rose-900/30"
    : down
    ? "text-emerald-200 border-emerald-500/60 bg-emerald-900/30"
    : "text-slate-200 border-slate-600 bg-slate-800/50";
  const arrow = up ? "▲" : down ? "▼" : "–";
  return (
    <span className={`${base} ${tone}`} title={`${deltaMoney} vs last month`}>
      <span className="text-base leading-none">{arrow}</span>
      <span className="tabular-nums">{Math.abs(pct)}%</span>
      <span className="text-xs opacity-80">(MoM)</span>
    </span>
  );
}

const spenderAccent = (who: string) => {
  const v = (who || "").toLowerCase();
  if (v === "mike" || v === "husband")
    return "from-sky-600/20 to-sky-500/5 border-sky-500";
  if (v === "beth" || v === "wife")
    return "from-fuchsia-600/20 to-fuchsia-500/5 border-fuchsia-500";
  return "from-slate-600/20 to-slate-500/5 border-slate-500";
};
const spenderIcon = (who: string, className = "h-5 w-5") => {
  const v = (who || "").toLowerCase();
  if (v === "mike" || v === "husband") return <User className={className} />;
  if (v === "beth" || v === "wife") return <User2 className={className} />;
  return <HelpCircle className={className} />;
};

function MerchantLogo({
  src,
  alt = "",
  iconOverride,
  className = "",
}: {
  src?: string | null;
  alt?: string;
  iconOverride?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(!src);
  React.useEffect(() => setFailed(!src), [src]);

  if (!src || failed) {
    return iconOverride ? (
      <IconFromKey
        icon={iconOverride as any}
        className={`h-16 w-16 md:h-20 md:w-20 ${className}`}
      />
    ) : (
      <div
        className={`h-16 w-16 md:h-20 md:w-20 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center ${className}`}
        aria-label={alt || "merchant"}
      >
        <StoreIcon className="h-6 w-6 text-slate-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`h-16 w-16 md:h-20 md:w-20 rounded-xl border border-slate-700 bg-white object-contain p-1 ${className}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/* ------------------------------- page ------------------------------------ */

export default function ClientSpenderPage({
  slug,
  isDemo,
}: {
  slug: string;
  isDemo?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading spender…
        </div>
      }
    >
      <SpenderInner slug={slug} isDemo={!!isDemo} />
    </Suspense>
  );
}

function SpenderInner({ slug, isDemo }: { slug: string; isDemo: boolean }) {
  useSyncSelectedStatement();

  const router = useRouter();
  const demoRoute = useIsDemo();
  const base = demoRoute ? "/demo" : "";

  const CARD_TO_SPENDER = React.useMemo<Record<string, string>>(
    () =>
      demoRoute
        ? { "5280": "Husband", "0161": "Wife" }
        : { "5280": "Mike", "0161": "Beth" },
    [demoRoute]
  );

  const spender = normalizeSlugToSpender(slug);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editSeed, setEditSeed] = React.useState<string>("");

  const {
    version: brandVersion,
    detect,
    logoFor,
    rules,
  } = useBrandMap() as any;

  const selectedFromUrl = useSelectedStatementId();
  const [effectiveId, setEffectiveId] = React.useState<string>("");

  // choose valid statement id; persist; mirror to URL (non-demo)
  React.useEffect(() => {
    const id = pickBestStatementId(selectedFromUrl, demoRoute);
    if (!id) return;
    if (id !== effectiveId) setEffectiveId(id);
    if (id !== readCurrentId()) writeCurrentId(id);
    if (!demoRoute && typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("statement", id);
      router.replace(u.pathname + "?" + u.searchParams.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFromUrl, demoRoute]);

  // reflect inputs for consistency
  const { setInputs } = useReconcilerSelectors();
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

  // options for switcher
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

  const [period, setPeriod] = React.useState<Period>("CURRENT");

  const whoForRow = React.useCallback(
    (r: any): string => {
      const explicit = (r.user || "").trim();
      if (explicit) return explicit;
      const last4 = typeof r.cardLast4 === "string" ? r.cardLast4 : undefined;
      if (last4 && CARD_TO_SPENDER[last4]) return CARD_TO_SPENDER[last4];
      return "Joint";
    },
    [CARD_TO_SPENDER]
  );

  // CURRENT/YTD rows derived directly from snapshots
  const scopedAllRows = React.useMemo(() => {
    if (!effectiveId) return [] as any[];
    return period === "YTD"
      ? buildRowsForYTD(effectiveId)
      : buildRowsForCurrent(effectiveId);
  }, [effectiveId, period]);

  const rows = React.useMemo(
    () =>
      scopedAllRows.filter(
        (r) => whoForRow(r).toLowerCase() === spender.toLowerCase()
      ),
    [scopedAllRows, spender, whoForRow]
  );

  // previous-month rows
  const prevRowsAll = React.useMemo(() => {
    if (period !== "CURRENT" || !effectiveId) return [] as any[];
    const prevId = prevStatementId(effectiveId);
    if (!prevId) return [] as any[];
    return buildRowsForCurrent(prevId);
  }, [period, effectiveId]);

  const prevScopedRows = React.useMemo(
    () =>
      prevRowsAll.filter(
        (r) => whoForRow(r).toLowerCase() === spender.toLowerCase()
      ),
    [prevRowsAll, spender, whoForRow]
  );

  // merchant aggregation (logo detection; small normalization)
  const byMerchant = React.useMemo(() => {
    const normalizeLabel = (s: string) =>
      (s || "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b([a-z])/g, (mm) => mm.toUpperCase());

    const sumBy = (arr: any[]) => {
      const m: Record<string, number> = {};
      for (const r of arr) {
        const spend = Math.abs(r.amount < 0 ? r.amount : 0);
        if (!spend) continue;
        const label = normalizeLabel(
          prettyDesc(r.description || r.merchant || "")
        );
        m[label] = (m[label] ?? 0) + spend;
      }
      return m;
    };

    const curr = sumBy(rows);
    const prev = sumBy(prevScopedRows);

    return Object.entries(curr)
      .map(([label, amt]) => {
        const normalize = (s: string) =>
          (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        const ruleByName =
          (rules || []).find(
            (r: any) =>
              r.enabled !== false && normalize(r.name) === normalize(label)
          ) || null;

        const hit = ruleByName || detect(label) || null;

        let logo: string | null = null;
        let iconOverride: string | null = null;

        if (hit?.noLogo) {
          iconOverride = hit.icon || "generic";
        } else if (hit?.domain) {
          logo = `https://logo.clearbit.com/${hit.domain}`;
        } else if (hit?.name) {
          logo = logoFor(hit.name);
        } else {
          logo = logoFor(label);
        }

        const trend = computeTrend(amt, prev[label] ?? 0);
        const deltaMoney =
          (trend.delta >= 0 ? "" : "−") + money(Math.abs(trend.delta));
        return {
          label,
          amt,
          prev: prev[label] ?? 0,
          logo,
          iconOverride,
          trend,
          deltaMoney,
        };
      })
      .sort((a, b) => b.amt - a.amt);
  }, [rows, prevScopedRows, detect, logoFor, rules, brandVersion]);

  const viewMeta = React.useMemo(() => {
    if (!effectiveId) return undefined;
    const idx = readIndex();
    return idx[effectiveId];
  }, [effectiveId]);

  const total = React.useMemo(
    () => rows.reduce((s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0), 0),
    [rows]
  );

  const accent = spenderAccent(spender);

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 overflow-x-clip">
        {/* Header / toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-xl bg-slate-900 border border-slate-700 p-2">
              {spenderIcon(spender)}
            </span>
            <span>{spender}</span>
          </h1>

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
              // @ts-ignore your component accepts value/onChange
              value={effectiveId}
              onChange={(id: string) => {
                setEffectiveId(id);
                writeCurrentId(id);
                if (!demoRoute && typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.set("statement", id);
                  router.replace(u.pathname + "?" + u.searchParams.toString());
                }
              }}
              available={Object.values(readIndex())
                .map((s) => s.id)
                .sort()}
              showLabel={false}
              size="sm"
              className="w-44 sm:w-56"
            />

            <span className="text-sm">Period</span>
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

        {/* Summary band */}
        <section
          className={`rounded-2xl border border-l-4 p-4 sm:p-5 bg-slate-900 bg-gradient-to-br ${accent}`}
        >
          <div className="flex items-center justify-between">
            <Link
              href={`${base}/dashboard${
                effectiveId
                  ? `?statement=${encodeURIComponent(effectiveId)}`
                  : ""
              }`}
              aria-label="Back to Dashboard"
              title="Back to Dashboard"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-xl
                       border border-slate-700 bg-slate-900 hover:bg-slate-800
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              <ArrowLeft className="h-5 w-5 text-slate-300" />
              <span className="text-sm text-slate-300">Back to Dashboard</span>
            </Link>

            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Total spend
              </div>
              <div className="text-2xl sm:text-3xl font-semibold">
                {money(total)}
              </div>
            </div>
          </div>
        </section>

        {/* Merchants grid with MoM trend */}
        <section>
          <h3 className="font-semibold mb-2">By Merchant</h3>
          {byMerchant.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
              No transactions in this scope.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {byMerchant.map(
                ({
                  label,
                  amt,
                  logo,
                  iconOverride,
                  trend,
                  deltaMoney,
                  prev,
                }) => (
                  <li key={label} className="group">
                    <div
                      className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                         transition-transform duration-150 will-change-transform
                         group-hover:translate-y-[-2px] group-hover:shadow-lg
                         bg-gradient-to-br from-slate-600/20 to-slate-500/5 border-slate-500`}
                    >
                      <div className="flex items-start justify-between">
                        <TrendBadgeLarge
                          dir={trend.dir}
                          pct={trend.pct}
                          deltaMoney={deltaMoney}
                        />
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">
                            This month
                          </div>
                          <div className="text-xl sm:text-2xl font-semibold">
                            {money(amt)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <div className="relative shrink-0">
                          <MerchantLogo
                            src={logo}
                            alt={label}
                            iconOverride={iconOverride}
                          />
                          <button
                            type="button"
                            aria-label="Edit brand mapping"
                            title="Edit brand mapping"
                            onClick={(e) => {
                              e.preventDefault();
                              setEditSeed(label);
                              setEditOpen(true);
                            }}
                            className="absolute -right-1 -bottom-1 h-6 w-6 rounded-lg
                 border border-slate-700 bg-slate-900/95
                 opacity-0 group-hover:opacity-100 transition
                 flex items-center justify-center"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            <span className="sr-only">Edit brand mapping</span>
                          </button>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{label}</div>
                          <div className="text-xs text-slate-400">
                            Prev {money(prev)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </section>

        {/* Transactions */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <h3 className="font-semibold mb-3">Transactions</h3>

          <ul className="md:hidden divide-y divide-slate-800">
            {rows.length === 0 && (
              <li className="py-3 text-sm text-slate-400">No transactions.</li>
            )}
            {rows.map((r, i) => (
              <li key={`${r.id || "row"}-${i}`} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {money(Math.abs(r.amount))}
                  </div>
                  <div className="text-xs text-slate-400">{r.date || ""}</div>
                </div>
                <div className="text-sm mt-0.5">
                  {prettyDesc(r.description)}
                </div>
              </li>
            ))}
          </ul>

          {rows.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-950">
                  <tr>
                    <th className="text-left p-2 w-24">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2 w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={`${r.id || "row"}-${i}`}
                      className="border-t border-slate-800"
                    >
                      <td className="p-2">{r.date || ""}</td>
                      <td className="p-2">{prettyDesc(r.description)}</td>
                      <td className="p-2 text-right">
                        {money(Math.abs(r.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <BrandLogoDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          seedLabel={editSeed}
        />
      </div>
    </ProtectedRoute>
  );
}
