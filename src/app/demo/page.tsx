// app/demo/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  emptyStatement,
  makeId,
  monthLabel,
  upsertStatement,
  writeCurrentId,
  readIndex,
} from "@/lib/statements";
import {
  FileDown,
  LayoutDashboard,
  Tags,
  Receipt,
  TrendingUp,
  Images,
  Wand2,
  Network,
} from "lucide-react";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => USD.format(n);

export default function DemoHome() {
  const r = useRouter();
  const [hasData, setHasData] = React.useState(false);

  // Detect if demo data is already present
  React.useEffect(() => {
    try {
      const idx = readIndex();
      setHasData(Object.keys(idx).length > 0);
    } catch {
      setHasData(false);
    }
  }, []);

  const refreshFlag = React.useCallback(() => {
    const idx = readIndex();
    setHasData(Object.keys(idx).length > 0);
  }, []);

  const seed = React.useCallback(() => {
    // Two months so charts/trends have shape
    const months = [
      { year: 2025, month: 6 }, // June
      { year: 2025, month: 7 }, // July
    ];

    months.forEach(({ year, month }, i) => {
      const id = makeId(year, month);
      const s = emptyStatement(id, `${monthLabel(month)} ${year}`, year, month);

      const baseTx = [
        // income
        {
          id: `tx-dep-${i}`,
          date: `${String(month).padStart(2, "0")}/01`,
          description: "Payroll Direct Deposit",
          amount: +5000,
          category: "Income",
          user: "Joint",
        },

        // expenses
        {
          id: `tx-groc-${i}-1`,
          date: `${String(month).padStart(2, "0")}/02`,
          description: "HARRIS TEETER #123",
          amount: -138.77,
          category: "Groceries",
          user: "Wife",
          cardLast4: "0161",
        },
        {
          id: `tx-amzn-${i}`,
          date: `${String(month).padStart(2, "0")}/03`,
          description: "AMZN Mktp US*G4T92",
          amount: -82.14,
          category: "Amazon Marketplace",
          user: "Husband",
          cardLast4: "5280",
        },
        {
          id: `tx-util-${i}`,
          date: `${String(month).padStart(2, "0")}/05`,
          description: "Dominion Energy VA",
          amount: -195.88,
          category: "Utilities",
          user: "Joint",
        },
        {
          id: `tx-house-${i}`,
          date: `${String(month).padStart(2, "0")}/06`,
          description: "Newrez (Mortgage)",
          amount: -1895.0,
          category: "Housing",
          user: "Joint",
        },
        {
          id: `tx-gas-${i}`,
          date: `${String(month).padStart(2, "0")}/08`,
          description: "Shell #334 Fuel",
          amount: -58.41,
          category: "Gas",
          user: "Husband",
          cardLast4: "5280",
        },
        {
          id: `tx-dine-${i}`,
          date: `${String(month).padStart(2, "0")}/09`,
          description: "Taste Unlimited",
          amount: -42.63,
          category: "Dining",
          user: "Wife",
          cardLast4: "0161",
        },
        {
          id: `tx-ins-${i}`,
          date: `${String(month).padStart(2, "0")}/12`,
          description: "Blue Cross Insurance",
          amount: -120.33,
          category: "Insurance",
          user: "Joint",
        },
        {
          id: `tx-sub-${i}`,
          date: `${String(month).padStart(2, "0")}/15`,
          description: "Netflix.com",
          amount: -15.99,
          category: "Subscriptions",
          user: "Joint",
        },
      ];

      const beginningBalance = i === 0 ? 1200 : 1400;
      const totalDeposits = 5000;
      const totalWithdrawals = baseTx
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      const seeded = {
        ...s,
        inputs: { beginningBalance, totalDeposits, totalWithdrawals },
        pagesRaw: [],
        cachedTx: baseTx,
      };

      upsertStatement(seeded);
      if (i === months.length - 1) writeCurrentId(id); // land on latest
    });

    refreshFlag();
    r.replace("/demo/dashboard");
  }, [r, refreshFlag]);

  const resetAndReseed = React.useCallback(() => {
    try {
      localStorage.removeItem("reconciler.statements.index.v2");
      localStorage.removeItem("reconciler.statements.current.v2");
    } catch {}
    seed();
  }, [seed]);

  return (
    <main className="min-h-[70vh] max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold">Live Demo</h1>
      <p className="mt-2 text-slate-300">
        Preview Forevian with two months of sample data. No sign-in required.
        Everything runs locally in your browser.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {hasData ? (
          <>
            <Link
              href="/demo/dashboard"
              className="rounded-xl px-4 py-2 bg-cyan-500 text-gray-900 font-semibold hover:bg-cyan-400"
            >
              Open Dashboard
            </Link>
            <button
              onClick={resetAndReseed}
              className="rounded-xl px-4 py-2 border border-slate-700 hover:bg-slate-900"
              title="Reset the sample data then reopen the dashboard"
            >
              Reset sample data
            </button>
          </>
        ) : (
          <>
            <button
              onClick={seed}
              className="rounded-xl px-4 py-2 bg-cyan-500 text-gray-900 font-semibold hover:bg-cyan-400"
            >
              Start the demo
            </button>
            <Link
              href="/"
              className="rounded-xl px-4 py-2 border border-slate-700 hover:bg-slate-900"
            >
              Back
            </Link>
          </>
        )}
      </div>

      {/* Quick links preview */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <Feature
            href="/demo/reconciler"
            title="Paste or upload statements"
            desc="Parser recognizes dates, amounts, cash back splits, transfers, and deposits."
            Icon={FileDown}
            accent="from-emerald-600/20 to-emerald-500/5 border-emerald-500"
          />
          <Feature
            href="/demo/reconciler"
            title="Aliases & smart rules"
            desc="Normalize messy merchant text and auto-apply categories using your rules."
            Icon={Wand2}
            accent="from-violet-600/20 to-violet-500/5 border-violet-500"
          />
          <Feature
            href="/demo/dashboard/category"
            title="Categories you control"
            desc="Manage categories (incl. Amazon group) and drill into details."
            Icon={Tags}
            accent="from-pink-600/20 to-pink-500/5 border-pink-500"
          />
          <Feature
            href="/demo/reconciler"
            title="Fast reconciliation"
            desc="See parsed totals, adjust inputs, and lock your monthly statement."
            Icon={Receipt}
            accent="from-amber-600/20 to-amber-500/5 border-amber-500"
          />
          <Feature
            href="/demo/dashboard"
            title="Visual dashboard"
            desc="Top categories, spend by spender, and quick links into deep-dives."
            Icon={LayoutDashboard}
            accent="from-cyan-600/20 to-cyan-500/5 border-cyan-500"
          />
          <Feature
            href="/demo/dashboard/category"
            title="Brand logos & icons"
            desc="Auto-infer logos, or choose a custom icon per merchant with one click."
            Icon={Images}
            accent="from-fuchsia-600/20 to-fuchsia-500/5 border-fuchsia-500"
          />
          <Feature
            href="/demo/reconciler"
            title="Rule engine"
            desc="Create keyword/regex rules that match merchants and set categories."
            Icon={Network}
            accent="from-slate-600/20 to-slate-500/5 border-slate-500"
          />
          <Feature
            href="/demo/trend"
            title="Trends & insights"
            desc="Spending patterns, category shifts, and monthly comparisons at a glance."
            Icon={TrendingUp}
            accent="from-blue-600/20 to-blue-500/5 border-blue-500"
          />
          <Feature
            href="/demo/budget"
            title="Budgets (preview)"
            desc="Lightweight monthly targets and variance view."
            Icon={Tags}
            accent="from-teal-600/20 to-teal-500/5 border-teal-500"
          />
        </ul>
      </section>

      {/* What you'll see */}
      <div className="mt-8 rounded-2xl border border-slate-700 p-4 bg-slate-900">
        <div className="text-sm text-slate-400">What you'll see</div>
        <ul className="mt-2 space-y-1 text-sm">
          <li>• Real parsing UI, categories, brand logos/icons</li>
          <li>• KPIs, spender view, category cards & drill-downs</li>
          <li>• Trends & early budget preview</li>
          <li>• Fully local: no cloud writes</li>
        </ul>
      </div>
    </main>
  );
}

/* --- tiny feature card --- */
function Feature({
  href,
  title,
  desc,
  Icon,
  accent,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: string; // gradient + border classes
}) {
  return (
    <li className="group">
      <Link href={href} className="block focus:outline-none">
        <div
          className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
            transition-transform duration-150 will-change-transform
            group-hover:-translate-y-0.5 group-hover:shadow-lg
            bg-gradient-to-br ${accent}`}
        >
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-slate-950/60 border border-slate-700 grid place-items-center shrink-0">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-white">{title}</div>
              <div className="text-sm text-slate-300 mt-0.5">{desc}</div>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
