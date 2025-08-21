"use client";
import React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { type Period } from "@/lib/period";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { prettyDesc } from "@/lib/txEnrich";
import StatementSwitcher from "@/components/StatementSwitcher";
import { useRowsForSelection } from "@/helpers/useRowsForSelection";
import { Pencil, ArrowLeft } from "lucide-react";
import { groupMembersForSlug, labelForSlug } from "@/lib/categoryGroups";
import { useBrandMap } from "@/app/providers/BrandMapProvider";
import BrandLogoDialog from "@/components/BrandLogoDialog";
import { catToSlug, slugToCat } from "@/lib/slug";
import { useCategories } from "@/app/providers/CategoriesProvider";
import { iconForCategory, IconFromKey, IconKey, isIconKey } from "@/lib/icons";

import ProtectedRoute from "@/components/ProtectedRoute";

/* ----------------------------- trends helpers ---------------------------- */

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

/* ----------------------------- small helpers ----------------------------- */

type PeriodEx = Period;
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => moneyFmt.format(n);

function unslug(s: string) {
  try {
    return decodeURIComponent(String(s)).replace(/-/g, " ");
  } catch {
    return String(s).replace(/-/g, " ");
  }
}

function accentForCategory(catName: string) {
  const c = catName.toLowerCase();
  if (/amazon\s*marketplace/i.test(c))
    return "from-pink-600/20 to-pink-500/5 border-pink-500";
  if (/amazon\s*fresh/i.test(c))
    return "from-emerald-600/20 to-emerald-500/5 border-emerald-500";
  if (/prime\s*video/i.test(c))
    return "from-violet-600/20 to-violet-500/5 border-violet-500";
  if (/grocer/.test(c))
    return "from-emerald-600/20 to-emerald-500/5 border-emerald-500";
  if (/fast\s*food|dining|restaurant/.test(c))
    return "from-orange-600/20 to-orange-500/5 border-orange-500";
  if (/gas|fuel/.test(c))
    return "from-amber-600/20 to-amber-500/5 border-amber-500";
  if (/housing|mortgage|rent/.test(c))
    return "from-cyan-600/20 to-cyan-500/5 border-cyan-500";
  if (/utilities?/.test(c))
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

/** Very small brand-domain map for logo fetching (extend anytime). */
const BRAND_DOMAINS: Array<[RegExp, string]> = [
  [/wendy/i, "wendys.com"],
  [/taco\s*bell/i, "tacobell.com"],
  [/mcdonald/i, "mcdonalds.com"],
  [/chick-?fil-?a/i, "chick-fil-a.com"],
  [/starbucks/i, "starbucks.com"],
  [/target/i, "target.com"],
  [/amazon/i, "amazon.com"],
  [/costco/i, "costco.com"],
  [/home\s*depot/i, "homedepot.com"],
  [/netflix/i, "netflix.com"],
  [/disney/i, "disneyplus.com"],
  [/hulu/i, "hulu.com"],
  [/t-?mobile/i, "t-mobile.com"],
  [/dominion\s*energy/i, "dominionenergy.com"],
];

function logoForMerchant(label: string): string | null {
  const hit = BRAND_DOMAINS.find(([rx]) => rx.test(label));
  return hit ? `https://logo.clearbit.com/${hit[1]}` : null;
}

// --- Merchant canonicalization + logos ------------------------------------
type BrandPat = { name: string; domain: string; rx: RegExp };

// expand anytime
export const BRAND_PATS: BrandPat[] = [
  {
    name: "Prime Video",
    domain: "primevideo.com",
    rx: /\b(prime\s*video|amzn\s*digital\s*video)\b/i,
  },
  { name: "Amazon Fresh", domain: "amazon.com", rx: /\bamazon\s*fresh\b/i },
  {
    name: "Amazon Marketplace",
    domain: "amazon.com",
    rx: /\b(?:amzn|amazon)\s*(?:mktp|mktplc|mktpl|market(?:place)?|mark\*)\b/i,
  },
  {
    name: "Dairy Queen",
    domain: "dairyqueen.com",
    rx: /\b(?:dairy\s*queen|dq)\b/i,
  },
  {
    name: "Cracker Barrel",
    domain: "crackerbarrel.com",
    rx: /\bcracker\s*barrel\b/i,
  },
  {
    name: "Taste",
    domain: "tasteunlimited.com",
    rx: /\btaste(?:\s+unlimited)?\b/i,
  },
  { name: "Zaxby's", domain: "zaxbys.com", rx: /\bzaxby'?s?\b/i },
  { name: "Cava", domain: "cava.com", rx: /\bcava\b/i },
  { name: "Pizza Hut", domain: "pizzahut.com", rx: /\bpizza\s*hut\b/i },
  { name: "Wendy's", domain: "wendys.com", rx: /\bwendy'?s\b/i },
  { name: "Taco Bell", domain: "tacobell.com", rx: /\btaco\s*bell\b/i },
  { name: "Starbucks", domain: "starbucks.com", rx: /\bstarbucks\b/i },
  { name: "Target", domain: "target.com", rx: /\btarget\b/i },
  { name: "Amazon", domain: "amazon.com", rx: /\b(?:amazon|amzn)\b/i },
  { name: "Costco", domain: "costco.com", rx: /\bcostco\b/i },
  { name: "Home Depot", domain: "homedepot.com", rx: /\bhome\s*depot\b/i },
  { name: "Netflix", domain: "netflix.com", rx: /\bnetflix\b/i },
  {
    name: "Judy's",
    domain: "judyssichuancuisine.com",
    rx: /\bjudy'?s(?:\s+sichuan(?:\s+(?:ii|2))?)?\b/i,
  },
  {
    name: "Honey & Hooch",
    domain: "honeyandhooch.com",
    rx: /\bhoney\s*(?:&|and)\s*hooch\b/i,
  },
  {
    name: "3 Amigos",
    domain: "3amigosmexicanrestaurants.com",
    rx: /\b3\s*amigos(?:\s+mexican(?:\s*r(?:estaurant|estaurants)?)?)?\b/i,
  },
];

function cleanNoise(text: string) {
  let s = text || "";
  s = s.replace(
    /^(?:SPO|TST|TS|SQ|SQM|DNH|DOORDASH|UBER|GH|GRUBHUB|AMZN|AMAZON)\s*\*/i,
    " "
  );
  s = s.replace(/https?:\/\/\S+/gi, " ");
  s = s.replace(/\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g, " ");
  s = s.replace(/#\s*\d{2,}/g, " ");
  s = s.replace(/\b\d{4,}\b/g, " ");
  s = s.replace(
    /\b(virginia\s*bch|virginia|beach|chesape\w*|chesapeake)\b/gi,
    " "
  );
  s = s.replace(
    /\b(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV)\b/gi,
    " "
  );
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function canonicalizeMerchantLabel(raw: string) {
  const input = raw || "";
  const aliased = applyAlias(input) || null;

  for (const b of BRAND_PATS) if (b.rx.test(input)) return b.name;

  const cleaned = cleanNoise(input);
  for (const b of BRAND_PATS) if (b.rx.test(cleaned)) return b.name;

  if (aliased) {
    for (const b of BRAND_PATS) if (b.rx.test(aliased)) return b.name;
    const aliasedClean = cleanNoise(aliased);
    for (const b of BRAND_PATS) if (b.rx.test(aliasedClean)) return b.name;
    return titleCase(aliasedClean || aliased);
  }

  return titleCase(cleaned || input);
}

function logoUrlFor(label: string) {
  const hit = BRAND_PATS.find((b) => b.rx.test(label));
  if (hit) return `https://logo.clearbit.com/${hit.domain}`;
  const word = label.toLowerCase().split(/\s+/)[0];
  return `https://logo.clearbit.com/${word}.com`;
}

function MerchantLogo({
  src,
  alt = "",
  category,
  initials,
  className = "",
  iconOverride,
}: {
  src?: string | null;
  alt?: string;
  category: string;
  initials?: string;
  className?: string;
  iconOverride?: IconKey | null;
}) {
  const [failed, setFailed] = React.useState(!src);

  React.useEffect(() => {
    // when the src changes (e.g., you saved a new domain), try loading again
    setFailed(!src);
  }, [src]);

  // 🔧 when src changes, try again
  React.useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`h-16 w-16 md:h-20 md:w-20 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center ${className}`}
        aria-label={alt || "merchant"}
      >
        {iconOverride ? (
          <IconFromKey icon={iconOverride} className="h-6 w-6" />
        ) : (
          iconForCategory(category, "h-6 w-6")
        )}
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

const moneySigned = (n: number) => (n >= 0 ? "" : "−") + money(Math.abs(n));

type MerchantAgg = {
  label: string;
  amt: number;
  logo: string | null;
  prev: number;
  trend: ReturnType<typeof computeTrend>;
  deltaMoney: string;
  icon: IconKey | null;
};

/* ---------------------------------- page ---------------------------------- */

export default function CategoryDetailPage() {
  const { categories } = useCategories();
  const params = useParams<{ slug: string }>();
  const { version: brandVersion, detect, logoFor, rules } = useBrandMap();

  const [editOpen, setEditOpen] = React.useState(false);
  const [editSeed, setEditSeed] = React.useState<string>("");
  const { transactions } = useReconcilerSelectors();

  // URL-driven selection
  const sp = useSearchParams();
  const urlId = sp.get("statement"); // string | null
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (urlId && readCurrentId() !== urlId) writeCurrentId(urlId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId]);

  const selectedId: string = (urlId ?? (mounted ? readCurrentId() : "")) || "";
  const [period, setPeriod] = React.useState<PeriodEx>("CURRENT");

  // Rows for the selected statement / scope
  const viewRows = useRowsForSelection(period, selectedId, transactions);

  // Pull meta for the header chip from the selected id
  const viewMeta = React.useMemo(() => {
    if (!selectedId) return undefined;
    const idx = readIndex();
    return idx[selectedId];
  }, [selectedId]);

  // --- read slug and detect if it's a group
  const slug = (params.slug || "").toLowerCase();
  const groupMembers = groupMembersForSlug(slug); // null if not a group
  const catDisplay = labelForSlug(slug); // prettified
  const headerLabel = slugToCat(slug, categories);

  const parentLabelLc = catDisplay.toLowerCase();

  // --- filter current rows (slug compare)
  const rows = React.useMemo(() => {
    const rowSlug = (r: any) =>
      catToSlug((r.categoryOverride ?? r.category ?? "Uncategorized").trim());

    if (groupMembers?.length) {
      // normalize all group members to slugs once
      const targetSlugs = new Set(groupMembers.map((c) => catToSlug(c.trim())));
      // also accept the parent slug itself
      targetSlugs.add(slug);

      return viewRows.filter((r) => targetSlugs.has(rowSlug(r)));
    }

    return viewRows.filter((r) => rowSlug(r) === slug);
  }, [viewRows, groupMembers, slug]);

  // --- previous month rows for the SAME scope (for MoM)
  const prevScopedRows = React.useMemo(() => {
    if (period !== "CURRENT") return [] as typeof rows;

    const idx = readIndex();
    const prevId = prevStatementId(selectedId);
    if (!prevId) return [] as typeof rows;

    const s = idx[prevId];
    if (!s) return [] as typeof rows;

    const rules = readCatRules();
    const raw = Array.isArray(s.cachedTx) ? s.cachedTx : [];
    const allPrev = applyCategoryRulesTo(
      rules,
      raw,
      applyAlias
    ) as typeof viewRows;

    const rowSlug = (r: any) =>
      catToSlug((r.categoryOverride ?? r.category ?? "Uncategorized").trim());

    if (groupMembers?.length) {
      const targetSlugs = new Set(groupMembers.map((c) => catToSlug(c.trim())));
      targetSlugs.add(slug);
      return allPrev.filter((r) => targetSlugs.has(rowSlug(r)));
    }

    return allPrev.filter((r) => rowSlug(r) === slug);
  }, [period, selectedId, groupMembers, slug]);

  // Previous statement rows (for MoM trend)
  const prevRows = React.useMemo(() => {
    if (period !== "CURRENT") return [] as typeof viewRows;

    const idx = readIndex();
    const selected = (sp.get("statement") ?? readCurrentId()) || "";
    const prevId = prevStatementId(selected);
    if (!prevId) return [] as typeof viewRows;

    const s = idx[prevId];
    if (!s) return [] as typeof viewRows;

    const rules = readCatRules();
    const raw = Array.isArray(s.cachedTx) ? s.cachedTx : [];
    return applyCategoryRulesTo(rules, raw, applyAlias) as typeof viewRows;
  }, [period, sp]);

  // Roll up previous month by merchant (use same canonicalizer)
  const prevByMerchant = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of prevRows) {
      const raw = prettyDesc(r.description || r.merchant || "");
      const label = canonicalizeMerchantLabel(raw);
      const amt = Math.abs(r.amount < 0 ? r.amount : 0);
      if (amt > 0) m[label] = (m[label] ?? 0) + amt;
    }
    return m;
  }, [prevRows]);

  // Merchant rollup (current + prev → trend)
  type TotalsMap = Record<string, number>;
  const sumMerchants = (rowsIn: typeof rows): TotalsMap => {
    const m: TotalsMap = {};
    for (const r of rowsIn) {
      const raw = prettyDesc(r.description || r.merchant || "");
      const label = canonicalizeMerchantLabel(raw);
      const amt = Math.abs(r.amount < 0 ? r.amount : 0);
      if (amt > 0) m[label] = (m[label] ?? 0) + amt;
    }
    return m;
  };

  const merchCurrent = React.useMemo(() => sumMerchants(rows), [rows]);
  const merchPrev = React.useMemo(
    () => sumMerchants(prevScopedRows),
    [prevScopedRows]
  );

  const byMerchant = React.useMemo<MerchantAgg[]>(() => {
    const normalize = (s: string) =>
      (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

    const resolve = (desc: string) => {
      const raw = prettyDesc(desc || "");
      const cleaned = cleanNoise(raw);

      let label = canonicalizeMerchantLabel(raw);

      const ruleByName =
        (rules || []).find(
          (r: any) =>
            r.enabled !== false && normalize(r.name) === normalize(label)
        ) || null;

      const hit =
        ruleByName || detect(raw) || detect(cleaned) || detect(label) || null;

      if (hit?.name) label = hit.name.trim();

      let iconOverride: IconKey | null = null;
      let logo: string | null = null;

      if (hit?.noLogo) {
        // user wants icon-only → coerce to valid IconKey (fallback to 'generic')
        iconOverride = isIconKey(hit.icon) ? hit.icon : "generic";
      } else if (hit?.domain) {
        logo = `https://logo.clearbit.com/${hit.domain}`;
      } else {
        logo = logoFor(hit?.name || label);
      }

      return { label, logo, iconOverride }; // iconOverride is now IconKey | null
    };

    const prevTotals = new Map<string, number>();
    for (const r of prevRows) {
      const amt = Math.abs(r.amount < 0 ? r.amount : 0);
      if (!amt) continue;
      const { label } = resolve(r.description || r.merchant || "");
      prevTotals.set(label, (prevTotals.get(label) ?? 0) + amt);
    }

    const cur: Record<
      string,
      { amt: number; logo: string | null; prev: number; icon: IconKey | null }
    > = {};
    for (const r of rows) {
      const amt = Math.abs(r.amount < 0 ? r.amount : 0);
      if (!amt) continue;
      const { label, logo, iconOverride } = resolve(
        r.description || r.merchant || ""
      );
      const prev = prevTotals.get(label) ?? 0;
      if (!cur[label]) cur[label] = { amt: 0, logo, prev, icon: iconOverride }; // NEW
      cur[label].amt += amt;
    }

    return Object.entries(cur)
      .map(([label, v]) => {
        const trend = computeTrend(v.amt, v.prev);
        return {
          label,
          amt: v.amt,
          logo: v.logo,
          prev: v.prev,
          trend,
          deltaMoney: moneySigned(trend.delta),
          icon: v.icon,
        };
      })
      .sort((a, b) => b.amt - a.amt);
  }, [rows, prevRows, detect, logoFor, rules, brandVersion]);

  const catAccent = accentForCategory(catDisplay);

  const total = React.useMemo(
    () => rows.reduce((s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0), 0),
    [rows]
  );

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 overflow-x-clip">
        {/* Header / toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-xl bg-slate-900 border border-slate-700 p-2">
              {iconForCategory(catDisplay)}
            </span>
            <span>{headerLabel}</span>
          </h1>

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

        {/* Summary */}
        <section
          className={`rounded-2xl border border-l-4 p-4 sm:p-5 bg-slate-900 bg-gradient-to-br ${catAccent}`}
        >
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <Link
              href={`/dashboard/category${
                selectedId ? `?statement=${selectedId}` : ""
              }`}
              aria-label="Back to Categories"
              title="Back to Categories"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-xl
             border border-slate-700 bg-slate-900 hover:bg-slate-800
             focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              <ArrowLeft className="h-5 w-5 text-slate-300" />
              <span className="text-sm text-slate-300">Back to Categories</span>
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

        {/* Merchants grid (cards) */}
        <section>
          <h3 className="font-semibold mb-2">By Merchant</h3>
          {!mounted ? (
            <ul
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
              suppressHydrationWarning
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <li
                  key={i}
                  className="rounded-2xl border border-slate-700 bg-slate-900 p-4 animate-pulse"
                >
                  <div className="h-16 w-16 rounded-xl bg-slate-800 mb-3" />
                  <div className="h-4 w-32 bg-slate-800 rounded" />
                  <div className="h-5 w-24 bg-slate-800 rounded mt-3" />
                </li>
              ))}
            </ul>
          ) : byMerchant.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
              No transactions in this scope.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {byMerchant.map(
                ({ label, amt, logo, trend, deltaMoney, prev, icon }) => {
                  const share = total ? Math.round((amt / total) * 100) : 0;
                  return (
                    <li key={label} className="group">
                      <div
                        className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                         transition-transform duration-150 will-change-transform
                         group-hover:translate-y-[-2px] group-hover:shadow-lg
                         bg-gradient-to-br ${catAccent}`}
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
                          <div className="shrink-0">
                            <MerchantLogo
                              src={logo}
                              alt={label}
                              category={catDisplay}
                              iconOverride={icon}
                            />
                            <button
                              type="button"
                              aria-label="Edit brand mapping"
                              title="Edit brand mapping"
                              onClick={(e) => {
                                e.preventDefault();
                                // if your cards are ever links, also stop bubbling:
                                // e.stopPropagation();
                                setEditSeed(label);
                                setEditOpen(true);
                              }}
                              className="absolute -right-1 -bottom-1 h-6 w-6 rounded-lg
                 border border-slate-700 bg-slate-900/95
                 opacity-0 group-hover:opacity-100 transition
                 flex items-center justify-center"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                              <span className="sr-only">
                                Edit brand mapping
                              </span>
                            </button>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{label}</div>
                            <div className="text-xs text-slate-400">
                              Share {share}% · Prev {money(prev)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                }
              )}
            </ul>
          )}
        </section>

        {/* Transactions */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <h3 className="font-semibold mb-3">Transactions</h3>

          {/* Mobile list */}
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
                <div className="text-xs text-slate-400 mt-0.5">
                  {r.user ||
                    (r.cardLast4 === "5280"
                      ? "Mike"
                      : r.cardLast4 === "0161"
                      ? "Beth"
                      : "Joint")}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          {rows.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-950">
                  <tr>
                    <th className="text-left p-2 w-24">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2 w-32">User</th>
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
                      <td className="p-2">
                        {r.user ||
                          (r.cardLast4 === "5280"
                            ? "Mike"
                            : r.cardLast4 === "0161"
                            ? "Beth"
                            : "Joint")}
                      </td>
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
