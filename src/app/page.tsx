// app/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useAuthUID } from "@/lib/fx";
import {
  FileDown,
  Wand2,
  Network,
  Tags,
  Receipt,
  LayoutDashboard,
  Images,
  Cloud,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

export default function Home() {
  const uid = useAuthUID();

  const Kpi = ({
    label,
    value,
    accent,
  }: {
    label: string;
    value: string;
    accent: "emerald" | "rose" | "violet" | "amber";
  }) => {
    const tone =
      accent === "emerald"
        ? "from-emerald-600/20 to-emerald-500/5 border-emerald-500"
        : accent === "rose"
        ? "from-rose-600/20 to-rose-500/5 border-rose-500"
        : accent === "violet"
        ? "from-violet-600/20 to-violet-500/5 border-violet-500"
        : "from-amber-600/20 to-amber-500/5 border-amber-500";
    return (
      <div
        className={`rounded-2xl border border-l-4 p-4 bg-slate-900 bg-gradient-to-br ${tone}`}
      >
        <div className="text-sm text-slate-300">{label}</div>
        <div className="text-xl sm:text-2xl font-semibold mt-0.5">{value}</div>
      </div>
    );
  };

  const Feature = ({
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
    accent: string;
  }) => (
    <li className="group">
      <Link href={href} className="block focus:outline-none">
        <div
          className={`relative rounded-2xl border bg-slate-900 border-l-4 p-4
            transition-transform duration-150 will-change-transform
            group-hover:-translate-y-0.5 group-hover:shadow-lg
            bg-gradient-to-br ${accent}`}
        >
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 rounded-xl bg-slate-950/60 border border-slate-700 flex items-center justify-center shrink-0">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-white">{title}</div>
              <p className="text-sm text-slate-300 mt-1">{desc}</p>
              <div className="mt-2 text-sm text-cyan-300 inline-flex items-center gap-1">
                Learn more <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );

  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-start px-6 py-14 text-center">
      {/* Hero */}
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
        Forevian<span className="text-cyan-400"> Finance</span>
      </h1>
      <p className="mt-4 max-w-2xl text-slate-300">
        Take control of your finances with clarity, simplicity, and insight
      </p>

      {/* <HeroCTA /> */}

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link
          href="/login"
          className="rounded-xl px-5 py-3 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
        >
          Sign in / Join
        </Link>
        <Link
          href="/demo"
          className="rounded-xl px-5 py-3 border border-slate-600 hover:bg-slate-900/50"
        >
          Try the live demo
        </Link>
      </div>

      {/* KPIs */}
      <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
        <Kpi label="History imported" value="6 months" accent="emerald" />
        <Kpi label="Expenses parsed" value="10.8k" accent="rose" />
        <Kpi label="Recurring detected" value="7 vendors" accent="violet" />
        <Kpi label="Parse accuracy" value="99.7%" accent="amber" />
      </div>

      {/* Feature grid */}
      {/* Feature grid */}
      <section className="mt-12 w-full max-w-6xl text-left rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-xl font-semibold">What you can do</h2>
          <span className="text-xs text-slate-400">Explore the toolkit</span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Row 1 */}
          <Feature
            href="/demo/reconciler"
            title="Paste or upload statements"
            desc="Our parser recognizes dates, amounts, cash back splits, transfers, and deposits."
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
            desc="Manage categories (including groups like Amazon) and drill into details."
            Icon={Tags}
            accent="from-pink-600/20 to-pink-500/5 border-pink-500"
          />

          {/* Row 2 */}
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

          {/* Row 3 */}
          <Feature
            href="/demo/reconciler"
            title="Rule engine"
            desc="Create keyword/regex rules that match merchants and set categories."
            Icon={Network}
            accent="from-slate-600/20 to-slate-500/5 border-slate-500"
          />
          <Feature
            href="/demo/dashboard"
            title="Trends & insights"
            desc="See spending patterns, category shifts, and monthly comparisons at a glance."
            Icon={TrendingUp}
            accent="from-blue-600/20 to-blue-500/5 border-blue-500"
          />
          <Feature
            href="/demo/dashboard"
            title="Cloud sync"
            desc="Signed in? Your categories and brand rules persist via Firestore."
            Icon={Cloud}
            accent="from-teal-600/20 to-teal-500/5 border-teal-500"
          />
        </ul>
      </section>

      {/* How it works */}
      <section className="mt-12 w-full max-w-4xl text-left">
        <h2 className="text-xl font-semibold mb-3 text-center">How it works</h2>
        <ol className="grid grid-cols-1 md:grid-cols-5 gap-3 sm:gap-4">
          {[
            { t: "Paste statement", d: "Drop in your monthly pages." },
            {
              t: "Parse & clean",
              d: "We normalize merchants & split cash back.",
            },
            { t: "Categorize", d: "Aliases + rules apply instantly." },
            { t: "Reconcile", d: "Adjust inputs, confirm totals, save." },
            { t: "Track", d: "Use the dashboard & deep-dives." },
          ].map((s, i) => (
            <li
              key={s.t}
              className="rounded-2xl border border-slate-700 bg-slate-900 p-4"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <div className="font-semibold">
                  {i + 1}. {s.t}
                </div>
              </div>
              <div className="text-sm text-slate-300 mt-1">{s.d}</div>
            </li>
          ))}
        </ol>

        <div className="mt-6 text-center">
          {uid ? (
            <Link
              href="/demo/reconciler"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
            >
              Start reconciling <ArrowRight className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
            >
              Create an account <ArrowRight className="h-5 w-5" />
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
