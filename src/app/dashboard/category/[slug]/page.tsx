"use client";
import React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { type Period } from "@/lib/period";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import { applyAlias } from "@/lib/aliases";
import { prettyDesc } from "@/lib/txEnrich";
import StatementSwitcher from "@/components/StatementSwitcher";
import { useRowsForSelection } from "@/helpers/useRowsForSelection";
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
  ArrowUpRight,
  Pencil,
  Grid2x2,
} from "lucide-react";
import { groupMembersForSlug, labelForSlug } from "@/lib/categoryGroups";
import { useBrandMap } from "@/app/providers/BrandMapProvider";
import BrandLogoDialog from "@/components/BrandLogoDialog";

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

function iconForCategory(catName: string) {
  const c = catName.toLowerCase();
  if (/grocer/.test(c)) return <ShoppingCart className="h-5 w-5" />;
  if (/fast\s*food|dining|restaurant|coffee|food/.test(c))
    return <Utensils className="h-5 w-5" />;
  if (/gas|fuel/.test(c)) return <Fuel className="h-5 w-5" />;
  if (/housing|mortgage|rent|home/.test(c)) return <Home className="h-5 w-5" />;
  if (/utilities?/.test(c)) return <Cable className="h-5 w-5" />;
  if (/insurance/.test(c)) return <Shield className="h-5 w-5" />;
  if (/subscriptions?|stream|music|video|plus|netflix|hulu|disney/.test(c))
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

/** Returns a Clearbit logo URL if we can guess the brand; otherwise null. */
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

function detectBrand(text: string): { name: string; domain: string } | null {
  for (const b of BRAND_PATS)
    if (b.rx.test(text)) return { name: b.name, domain: b.domain };
  return null;
}

function cleanNoise(text: string) {
  let s = text || "";

  // Common POS/aggregator prefixes (add “SPO*”, “AMZN*”, “AMAZON*” patterns)
  s = s.replace(
    /^(?:SPO|TST|TS|SQ|SQM|DNH|DOORDASH|UBER|GH|GRUBHUB|AMZN|AMAZON)\s*\*/i,
    " "
  );

  // URLs
  s = s.replace(/https?:\/\/\S+/gi, " ");

  // Phone numbers
  s = s.replace(/\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g, " ");

  // Store numbers
  s = s.replace(/#\s*\d{2,}/g, " ");
  s = s.replace(/\b\d{4,}\b/g, " ");

  // City/state tails
  s = s.replace(
    /\b(virginia\s*bch|virginia|beach|chesape\w*|chesapeake)\b/gi,
    " "
  );
  s = s.replace(
    /\b(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV)\b/gi,
    " "
  );

  // Collapse whitespace
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function canonicalizeMerchantLabel(raw: string) {
  const input = raw || "";
  const aliased = applyAlias(input) || null;

  // 1) Try brand patterns on the RAW string first
  for (const b of BRAND_PATS) if (b.rx.test(input)) return b.name;

  // 2) Try brand patterns on the CLEANED RAW
  const cleaned = cleanNoise(input);
  for (const b of BRAND_PATS) if (b.rx.test(cleaned)) return b.name;

  // 3) If we have an alias, give it a chance too (raw → cleaned)
  if (aliased) {
    for (const b of BRAND_PATS) if (b.rx.test(aliased)) return b.name;
    const aliasedClean = cleanNoise(aliased);
    for (const b of BRAND_PATS) if (b.rx.test(aliasedClean)) return b.name;
    // last resort: prettify the alias
    return titleCase(aliasedClean || aliased);
  }

  // 4) Final fallback: prettify the cleaned raw
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
}: {
  src?: string | null;
  alt?: string;
  category: string; // use current category name to pick a fitting fallback icon
  initials?: string; // optional initials fallback (e.g., "JU", "3A")
  className?: string;
}) {
  const [failed, setFailed] = React.useState(!src);

  if (!src || failed) {
    // clean, on-brand fallback: icon for the category (restaurants → Utensils)
    return (
      <div
        className={`h-10 w-10 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center ${className}`}
        aria-label={alt || "merchant"}
      >
        {initials ? (
          <span className="text-[10px] font-semibold tracking-wide text-slate-300">
            {initials}
          </span>
        ) : (
          iconForCategory(category)
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`h-10 w-10 rounded-xl border border-slate-700 bg-white object-contain p-1 ${className}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function CategoryDetailPage() {
  const params = useParams<{ slug: string }>();
  const { mounted: brandMounted, detect, logoFor } = useBrandMap();
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
  const catDisplay = labelForSlug(slug); // "Amazon" for 'amazon', else prettified text

  const parentLabelLc = catDisplay.toLowerCase();

  // --- filter rows
  const rows = React.useMemo(() => {
    // If this slug is a grouped parent (e.g., "amazon"), include:
    //  - any row whose category equals a member ("Prime Video", "Amazon Fresh", "Amazon Marketplace")
    //  - any row whose category still equals the parent ("Amazon") from older rules
    if (groupMembers?.length) {
      const targets = new Set(groupMembers.map((c) => c.trim().toLowerCase()));
      return viewRows.filter((r) => {
        const cat = (r.categoryOverride ?? r.category ?? "Uncategorized")
          .trim()
          .toLowerCase();
        return targets.has(cat) || cat === parentLabelLc;
      });
    }

    // Non-grouped: match the parent label exactly
    return viewRows.filter((r) => {
      const cat = (r.categoryOverride ?? r.category ?? "Uncategorized")
        .trim()
        .toLowerCase();
      return cat === parentLabelLc;
    });
  }, [viewRows, groupMembers, parentLabelLc]);

  // Merchant rollup
  const byMerchant = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      // prefer description; prettyDesc gives you a cleaner base
      const raw = prettyDesc(r.description || r.merchant || "");
      const label = canonicalizeMerchantLabel(raw);
      const amt = Math.abs(r.amount < 0 ? r.amount : 0);
      if (amt > 0) m[label] = (m[label] ?? 0) + amt;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const total = React.useMemo(
    () => rows.reduce((s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0), 0),
    [rows]
  );

  const catAccent = accentForCategory(catDisplay);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 overflow-x-clip">
      {/* Header / toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-xl bg-slate-900 border border-slate-700 p-2">
            {iconForCategory(catDisplay)}
          </span>
          <span>{catDisplay}</span>
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
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <Link
            href={`/dashboard/category${
              selectedId ? `?statement=${selectedId}` : ""
            }`}
            aria-label="Back to Categories"
            title="Back to Categories"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl
             border border-slate-700 bg-slate-900 hover:bg-slate-800
             focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          >
            <Grid2x2 className="h-5 w-5 text-slate-300" />
            <span className="sr-only">Back to Categories</span>
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
                <div className="h-10 w-10 rounded-xl bg-slate-800 mb-3" />
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
            {byMerchant.map(([label, amt]) => {
              const share = total ? Math.round((amt / total) * 100) : 0;
              const brand = detect(label); // BrandRule | null
              const logo = brand
                ? `https://logo.clearbit.com/${brand.domain}`
                : logoFor(label);
              return (
                <li key={label} className="group">
                  <div
                    className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
                                transition-transform duration-150 will-change-transform
                                group-hover:translate-y-[-2px] group-hover:shadow-lg
                                bg-gradient-to-br ${catAccent}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="shrink-0">
                        <MerchantLogo
                          src={logo}
                          alt={label}
                          category={catDisplay} // ← picks the right fallback icon
                        />
                        <button
                          type="button"
                          className="absolute -right-1 -bottom-1 h-6 w-6 rounded-lg border border-slate-700 bg-slate-900/90
               opacity-0 group-hover:opacity-100 transition"
                          title="Edit logo"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditSeed(label);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mx-auto opacity-80" />
                        </button>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{label}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          Share {share}%{" "}
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-lg sm:text-xl font-semibold">
                      {money(amt)}
                    </div>

                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-white/70 group-hover:bg-white transition-all"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Transactions (responsive: cards on mobile, table on desktop) */}
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
              <div className="text-sm mt-0.5">{prettyDesc(r.description)}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {r.user ||
                  (r.cardLast4 === "5280"
                    ? "Mike"
                    : r.cardLast4 === "0161"
                    ? "Beth"
                    : "Unknown")}
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
                          : "Unknown")}
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
  );
}
