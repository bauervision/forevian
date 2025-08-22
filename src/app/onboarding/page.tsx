// app/onboarding/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useImportProfile } from "@/lib/import/store";
import { learnFromSamples, type LearnedProfileDraft } from "@/lib/import/learn";
import { parseWithProfile } from "@/lib/import/run";
import type { ImportProfile } from "@/lib/import/profile";
import { useAuthUID } from "@/lib/fx";
import { useSpenders } from "@/lib/spenders";
import { useCategories } from "@/app/providers/CategoriesProvider";

/* ---------------- helpers ---------------- */

const canon = (l4: string | number) =>
  String(l4 ?? "")
    .replace(/\D/g, "")
    .slice(-4)
    .padStart(4, "0");

function StatusPill({
  ok,
  label,
  note,
}: {
  ok: boolean;
  label: string;
  note?: string;
}) {
  const base =
    "inline-flex items-center gap-2 px-2 py-1 rounded-xl border text-xs";
  const okCls = "border-emerald-500/70 text-emerald-300 bg-emerald-500/10";
  const warnCls = "border-amber-500/70 text-amber-300 bg-amber-500/10";
  return (
    <span className={`${base} ${ok ? okCls : warnCls}`}>
      <span className="grid place-items-center text-[10px] w-4 h-4 rounded-full border border-current">
        {ok ? "✓" : "!"}
      </span>
      <span>{label}</span>
      {note && <span className="opacity-70">· {note}</span>}
    </span>
  );
}

type PreviewRow = {
  line: string;
  fields: {
    date?: string;
    description?: string;
    amount?: number;
    last4?: string;
  };
};

function computeDetectionChecks(rows: PreviewRow[]) {
  const total = rows.length || 0;
  let dates = 0,
    descs = 0,
    amts = 0,
    last4s = 0;
  for (const r of rows) {
    if (r.fields?.date) dates++;
    if ((r.fields?.description || "").trim()) descs++;
    if (typeof r.fields?.amount === "number" && !Number.isNaN(r.fields.amount))
      amts++;
    if ((r.fields?.last4 || "").match(/^\d{4}$/)) last4s++;
  }
  const requiredPass = dates === total && descs === total && amts === total;
  const problems: string[] = [];
  if (dates !== total) problems.push("Missing date on one or more samples.");
  if (descs !== total)
    problems.push("Missing description on one or more samples.");
  if (amts !== total) problems.push("Missing amount on one or more samples.");
  return { total, dates, descs, amts, last4s, requiredPass, problems };
}

function isPersistedProfile(p: any): boolean {
  return (
    !!p &&
    typeof p === "object" &&
    typeof p.version === "number" &&
    p.version > 0
  );
}

function compactLine(s: string) {
  return (s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");
}

function useDraft(key: string, initial = "") {
  const [val, setVal] = React.useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(key, val);
    } catch {}
  }, [key, val]);
  return [val, setVal] as const;
}

/* ------------- categories ------------- */

type UIStarterCategory = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
};
type UIRule = {
  id: string;
  pattern: string;
  categoryId: string;
  isRegex?: boolean;
};

const DEFAULT_CATEGORIES: UIStarterCategory[] = [
  { id: "fastfood", name: "Fast Food", icon: "🍟", color: "#ef4444" },
  { id: "dining", name: "Dining", icon: "🍽️", color: "#f59e0b" },
  { id: "fuel", name: "Fuel", icon: "⛽", color: "#10b981" },
  { id: "home", name: "Home/Utilities", icon: "🏠", color: "#22c55e" },
  { id: "ent", name: "Entertainment", icon: "🎬", color: "#6366f1" },
  { id: "shop", name: "Shopping", icon: "🛍️", color: "#06b6d4" },
  { id: "pay", name: "Income/Payroll", icon: "💼", color: "#14b8a6" },
  { id: "xfer", name: "Transfers", icon: "🔁", color: "#a855f7" },
  { id: "rent", name: "Rent/Mortgage", icon: "🏡", color: "#84cc16" },
  { id: "debt", name: "Debt", icon: "💳", color: "#f43f5e" },
  { id: "impulse", name: "Impulse/Misc", icon: "🎲", color: "#fb923c" },
  { id: "doctors", name: "Doctors", icon: "🩺", color: "#38bdf8" },
  {
    id: "memberships",
    name: "Memberships (Costco, YMCA)",
    icon: "🪪",
    color: "#22d3ee",
  },
  {
    id: "subs",
    name: "Subscriptions (Netflix, Peacock)",
    icon: "📺",
    color: "#e879f9",
  },
  { id: "starbucks", name: "Starbucks", icon: "☕", color: "#166534" },
  { id: "cashback", name: "Cash Back", icon: "💵", color: "#84cc16" },
];

function randomNiceColor() {
  const palette = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#eab308",
    "#84cc16",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
    "#0ea5e9",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#f43f5e",
    "#10b981",
    "#38bdf8",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

function persistStarters(
  uid: string | null | undefined,
  cats: UIStarterCategory[],
  rules: UIRule[]
) {
  const who = uid ?? "anon";
  try {
    localStorage.setItem(
      `ui.import.starters.cats::${who}`,
      JSON.stringify(cats)
    );
    localStorage.setItem(
      `ui.import.starters.rules::${who}`,
      JSON.stringify(rules)
    );
  } catch {}
}

/* ------------- page component ------------- */

export default function Onboarding() {
  const r = useRouter();
  const uid = useAuthUID();
  const { profile, updateProfile, ready } = useImportProfile();
  const {
    map: spenderMap,
    setSpender,
    setSingleUser,
    confirmSetup,
  } = useSpenders();

  const { categories, setCategories } = useCategories();

  // drafts
  const DRAFT_W_KEY = `ui.import.onboard.withdrawal::${uid ?? "anon"}`;
  const DRAFT_D_KEY = `ui.import.onboard.deposit::${uid ?? "anon"}`;
  const [wText, setWText] = useDraft(DRAFT_W_KEY);
  const [dText, setDText] = useDraft(DRAFT_D_KEY);
  const wOne = compactLine(wText);
  const dOne = compactLine(dText);

  // stepper
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);

  // profile preview
  const [proposal, setProposal] = React.useState<Partial<ImportProfile> | null>(
    null
  );
  const [preview, setPreview] = React.useState<
    Array<{ line: string; fields: any }>
  >([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // categories & rules
  const [cats, setCats] = React.useState<UIStarterCategory[]>(
    () => DEFAULT_CATEGORIES
  );
  const [rules, setRules] = React.useState<UIRule[]>([]);

  // spenders (onboarding entry)
  const [singleChoice, setSingleChoice] = React.useState<"single" | "multi">(
    "single"
  );
  const [l4a, setL4a] = React.useState<string>(""); // first card
  const [nameA, setNameA] = React.useState<string>("");
  const [l4b, setL4b] = React.useState<string>(""); // second card
  const [nameB, setNameB] = React.useState<string>("");

  const hasProfile = ready && isPersistedProfile(profile);

  function toPartialProfile(p: LearnedProfileDraft): Partial<ImportProfile> {
    return { unifiedRegex: p.unifiedRegex, dateFmt: p.dateFmt };
  }

  async function detect() {
    setErr(null);
    setBusy(true);
    try {
      const w = wOne,
        d = dOne;
      if (!w || !d) {
        setErr("Please paste one withdrawal example and one deposit example.");
        return;
      }
      const { profile: learned } = learnFromSamples([w, d]);
      if (!learned) {
        setErr(
          "Couldn't confidently detect a pattern. Paste the full lines exactly as shown on your statement."
        );
        return;
      }
      const partial = toPartialProfile(learned);
      setProposal(partial);

      const parsed = parseWithProfile(partial as ImportProfile, [w, d]) || [];
      const rows = parsed.map((row, i) => ({
        line: i === 0 ? "Withdrawal sample" : "Deposit sample",
        fields: {
          date: row.date,
          description: row.description,
          amount: row.amount,
          last4: row.cardLast4 ? canon(row.cardLast4) : "",
        },
      }));
      setPreview(rows);

      // cheap rule seeds
      const sugg: UIRule[] = [];
      const addRule = (pattern: string, catId: string) =>
        sugg.push({
          id: crypto.randomUUID(),
          pattern,
          categoryId: catId,
          isRegex: false,
        });

      const wDesc = rows[0]?.fields?.description ?? "";
      const dDesc = rows[1]?.fields?.description ?? "";
      if (/PAYROLL|PAY|IBM/i.test(dDesc)) addRule("PAYROLL", "pay");
      if (/TRANSFER|ZELLE|VENMO|ONLINE TRANSFER/i.test(wDesc))
        addRule("TRANSFER", "xfer");
      if (/SHELL|BP|EXXON|SUNOCO|GAS|FUEL/i.test(wDesc)) addRule("GAS", "fuel");
      if (/AMAZON|TARGET|WALMART|BEST\s*BUY|SHOP/i.test(wDesc))
        addRule("AMAZON", "shop");
      if (/RENT|MORTGAGE/i.test(wDesc)) addRule("RENT", "rent");
      if (/STARBUCKS/i.test(wDesc)) addRule("STARBUCKS", "starbucks");
      if (/NETFLIX|PEACOCK|DISNEY|HULU|SPOTIFY|APPLE\s*MUSIC/i.test(wDesc))
        addRule("NETFLIX", "subs");
      if (/COSTCO|YMCA|SAM.?S\s*CLUB/i.test(wDesc))
        addRule("COSTCO", "memberships");

      setRules((prev) => (prev.length ? prev : sugg));

      const found = Array.from(
        new Set(rows.map((r) => r.fields?.last4).filter(Boolean))
      ) as string[];
      if (found[0]) setL4a(found[0]!);
      if (found[1]) setL4b(found[1]!);

      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  function saveProfile() {
    if (!proposal) return;
    const base: Pick<ImportProfile, "version" | "groups"> = {
      version: 1,
      groups: {} as ImportProfile["groups"],
    };
    const fullProfile: ImportProfile = {
      ...base,
      ...(proposal as ImportProfile),
    };
    updateProfile(fullProfile);
    persistStarters(uid, cats, rules);

    const names = cats.map((c) => c.name).filter(Boolean);
    const lower = new Set(categories.map((n: string) => n.toLowerCase()));
    const merged = [...categories];
    for (const n of names) if (!lower.has(n.toLowerCase())) merged.push(n);

    setCategories(merged);
  }

  /* ---------- Step 4: Spenders save ---------- */

  const step4CanContinue =
    singleChoice === "single" ||
    (canon(l4a) && nameA.trim()) ||
    (canon(l4b) && nameB.trim());

  function commitSpenders() {
    if (singleChoice === "single") {
      setSingleUser(true);
    } else {
      setSingleUser(false);
      const a = canon(l4a),
        b = canon(l4b);
      if (a && nameA.trim()) setSpender(a, nameA.trim());
      if (b && nameB.trim() && b !== a) setSpender(b, nameB.trim());
    }
    confirmSetup();
  }

  function StatusRow() {
    const checks = computeDetectionChecks(preview as any as PreviewRow[]);
    const ok = checks.requiredPass;
    return (
      <div
        className={`rounded-xl border p-3 text-sm ${
          ok
            ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-200"
            : "border-amber-500/70 bg-amber-500/10 text-amber-100"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {ok
              ? "Looks good — pattern detected."
              : "Needs attention — some fields are missing."}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <StatusPill
              ok={checks.dates === checks.total}
              label="Dates"
              note={`${checks.dates}/${checks.total}`}
            />
            <StatusPill
              ok={checks.descs === checks.total}
              label="Descriptions"
              note={`${checks.descs}/${checks.total}`}
            />
            <StatusPill
              ok={checks.amts === checks.total}
              label="Amounts"
              note={`${checks.amts}/${checks.total}`}
            />
            <StatusPill
              ok={checks.last4s > 0}
              label="Card last-4 (optional)"
              note={`${checks.last4s} found`}
            />
          </div>
        </div>
        {!ok && checks.problems.length > 0 && (
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {checks.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* ---------- render ---------- */

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">Quick Setup</h1>
        {hasProfile && (
          <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
            A profile already exists — you can re-learn it here
          </span>
        )}
      </div>

      {/* header steps */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { n: 1, label: "Paste & Detect" },
          { n: 2, label: "Review Result" },
          { n: 3, label: "Categories" },
          { n: 4, label: "Users" },
          { n: 5, label: "Review & Next" },
        ].map((s, idx, arr) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={[
                "w-6 h-6 rounded-full grid place-items-center border",
                step === (s.n as any)
                  ? "bg-cyan-500 text-slate-900 border-cyan-400"
                  : step > (s.n as any)
                  ? "bg-emerald-500 text-white border-emerald-400"
                  : "bg-slate-800 border-slate-700 text-slate-300",
              ].join(" ")}
            >
              {s.n}
            </div>
            <div
              className={
                step === (s.n as any) ? "font-semibold" : "text-slate-300"
              }
            >
              {s.label}
            </div>
            {idx < arr.length - 1 && <div className="w-8 h-px bg-slate-700" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <h3 className="font-semibold mb-3">1) Paste two examples</h3>
          <p className="text-sm text-slate-300 mb-3">
            Paste <strong>one withdrawal line</strong> and{" "}
            <strong>one deposit line</strong> exactly as they appear. Multi-line
            pastes are ok — we’ll compact them to a single line automatically.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">Withdrawal</div>
              <textarea
                rows={6}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3"
                placeholder={`6/26
Purchase authorized on 06/25 City of Norfolk Norfolk VA Card 5280
58.00`}
                value={wText}
                onChange={(e) => setWText(e.target.value)}
              />
              <div className="mt-1 text-[11px] text-slate-400">
                Preview:{" "}
                <code className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {wOne || "—"}
                </code>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Deposit</div>
              <textarea
                rows={6}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3"
                placeholder={`7/15
FANG 3141 Payroll Jul 15 TRN*1*9000852321
2,263.28`}
                value={dText}
                onChange={(e) => setDText(e.target.value)}
              />
              <div className="mt-1 text-[11px] text-slate-400">
                Preview:{" "}
                <code className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {dOne || "—"}
                </code>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={detect}
              className="rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400 disabled:opacity-60"
              disabled={busy}
            >
              {busy ? "Detecting…" : "Detect pattern"}
            </button>
            {err && <div className="text-sm text-rose-300">{err}</div>}
          </div>
        </section>
      )}

      {/* Step 2 */}
      {step === 2 && proposal && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <h3 className="font-semibold">2) Review match</h3>
          <StatusRow />
          <div className="text-sm text-slate-300">
            <div className="mb-1">
              Date format:&nbsp;
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                {proposal.dateFmt || "MM/DD"}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="text-left p-2">Sample</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-left p-2">Card Last4</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((m, i) => {
                  const missingDate = !m.fields?.date,
                    missingDesc = !(m.fields?.description || "").trim(),
                    missingAmt = !(
                      typeof m.fields?.amount === "number" &&
                      !Number.isNaN(m.fields.amount)
                    );
                  const badLast4 =
                    !!m.fields?.last4 &&
                    !String(m.fields.last4).match(/^\d{4}$/);
                  const tdMiss = "text-rose-300";
                  return (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="p-2 text-slate-400">{m.line}</td>
                      <td className={`p-2 ${missingDate ? tdMiss : ""}`}>
                        {m.fields?.date || "—"}
                      </td>
                      <td className={`p-2 ${missingDesc ? tdMiss : ""}`}>
                        {m.fields?.description || "—"}
                      </td>
                      <td
                        className={`p-2 text-right ${missingAmt ? tdMiss : ""}`}
                      >
                        {typeof m.fields?.amount === "number"
                          ? m.fields.amount
                          : "—"}
                      </td>
                      <td className={`p-2 ${badLast4 ? tdMiss : ""}`}>
                        {m.fields?.last4 || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setProposal(null)}
              className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800"
            >
              Try again
            </button>
            <button
              onClick={() => setStep(3)}
              className="rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
              disabled={
                !computeDetectionChecks(preview as any as PreviewRow[])
                  .requiredPass
              }
            >
              Continue to Categories →
            </button>
          </div>
        </section>
      )}

      {/* Step 3 – FULL Categories & Rules editor */}
      {step === 3 && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-5">
          <h3 className="font-semibold">3) Customize Categories & Rules</h3>
          <p className="text-sm text-slate-300">
            Set up a few categories and simple rules. Rules match{" "}
            <em>substrings</em> by default (toggle “regex” if you know what
            you’re doing). You can refine and add more later.
          </p>

          {/* Categories editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Categories</h4>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setCats((xs) => [
                      ...xs,
                      {
                        id: crypto.randomUUID(),
                        name: "New Category",
                        icon: "🗂️",
                        color: randomNiceColor(),
                      },
                    ])
                  }
                  className="text-xs rounded-lg px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700"
                >
                  + Add Category
                </button>
                <button
                  onClick={() =>
                    setCats((xs) =>
                      xs.map((c) => ({ ...c, color: randomNiceColor() }))
                    )
                  }
                  className="text-xs rounded-lg px-3 py-1 border border-slate-700 hover:bg-slate-800"
                  title="Randomize all colors"
                >
                  🎲 Randomize All
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {cats.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-12 gap-2 items-center rounded-xl border border-slate-700 bg-slate-950 p-2"
                >
                  <input
                    className="col-span-3 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1"
                    value={c.name}
                    onChange={(e) =>
                      setCats((xs) =>
                        xs.map((x) =>
                          x.id === c.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Name"
                  />
                  <input
                    className="col-span-2 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1"
                    value={c.icon ?? ""}
                    onChange={(e) =>
                      setCats((xs) =>
                        xs.map((x) =>
                          x.id === c.id ? { ...x, icon: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Icon (emoji)"
                  />

                  <div className="col-span-5 flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-10 rounded border border-slate-700 bg-slate-900"
                      value={c.color || "#1f2937"}
                      onChange={(e) =>
                        setCats((xs) =>
                          xs.map((x) =>
                            x.id === c.id ? { ...x, color: e.target.value } : x
                          )
                        )
                      }
                      title="Pick a color"
                    />
                    <input
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1"
                      value={c.color ?? ""}
                      onChange={(e) =>
                        setCats((xs) =>
                          xs.map((x) =>
                            x.id === c.id ? { ...x, color: e.target.value } : x
                          )
                        )
                      }
                      placeholder="#hex or name"
                    />
                    <button
                      onClick={() =>
                        setCats((xs) =>
                          xs.map((x) =>
                            x.id === c.id
                              ? { ...x, color: randomNiceColor() }
                              : x
                          )
                        )
                      }
                      className="text-xs rounded-lg px-2 py-1 border border-slate-700 hover:bg-slate-800"
                      title="Randomize color"
                    >
                      🎲
                    </button>
                  </div>

                  <div className="col-span-2 flex items-center justify-end">
                    <button
                      onClick={() => {
                        setCats((xs) => xs.filter((x) => x.id !== c.id));
                        setRules((rs) =>
                          rs.filter((r) => r.categoryId !== c.id)
                        );
                      }}
                      className="text-xs rounded-lg px-3 py-1 border border-slate-700 hover:bg-slate-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rules editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Rules</h4>
              <button
                onClick={() =>
                  setRules((rs) => [
                    ...rs,
                    {
                      id: crypto.randomUUID(),
                      pattern: "",
                      categoryId: cats[0]?.id ?? "uncat",
                      isRegex: false,
                    },
                  ])
                }
                className="text-xs rounded-lg px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700"
              >
                + Add Rule
              </button>
            </div>

            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-12 gap-2 items-center rounded-xl border border-slate-700 bg-slate-950 p-2"
                >
                  <input
                    className="col-span-6 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1"
                    value={r.pattern}
                    onChange={(e) =>
                      setRules((rs) =>
                        rs.map((x) =>
                          x.id === r.id ? { ...x, pattern: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Match pattern (e.g., AMAZON, SHELL, PAYROLL)"
                  />
                  <select
                    className="col-span-4 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1"
                    value={r.categoryId}
                    onChange={(e) =>
                      setRules((rs) =>
                        rs.map((x) =>
                          x.id === r.id
                            ? { ...x, categoryId: e.target.value }
                            : x
                        )
                      )
                    }
                  >
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon ? `${c.icon} ` : ""}
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label className="col-span-1 flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={!!r.isRegex}
                      onChange={(e) =>
                        setRules((rs) =>
                          rs.map((x) =>
                            x.id === r.id
                              ? { ...x, isRegex: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                    regex
                  </label>
                  <button
                    onClick={() =>
                      setRules((rs) => rs.filter((x) => x.id !== r.id))
                    }
                    className="col-span-1 text-xs rounded-lg px-3 py-1 border border-slate-700 hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {rules.length === 0 && (
                <div className="text-sm text-slate-400">
                  No rules yet. Click “Add Rule” to start a few quick mappings.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800"
            >
              ← Back
            </button>
            <button
              onClick={() => {
                saveProfile();
                setStep(4);
              }}
              className="rounded-xl px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Save & continue
            </button>
          </div>
        </section>
      )}

      {/* Step 4 – Users */}
      {step === 4 && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <h3 className="font-semibold">4) Users</h3>
          <p className="text-sm text-slate-300">
            If this is a single-user account, choose “single”. Otherwise, add up
            to two card last-4s and labels.
          </p>

          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="usr"
                checked={singleChoice === "single"}
                onChange={() => setSingleChoice("single")}
              />
              <span>Single-user — hide “User” column</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="usr"
                checked={singleChoice === "multi"}
                onChange={() => setSingleChoice("multi")}
              />
              <span>Multiple users — label cards</span>
            </label>
          </div>

          {singleChoice === "multi" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">
                  Card last-4 (e.g., 0161)
                </div>
                <input
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                  value={l4a}
                  onChange={(e) => setL4a(e.target.value)}
                  placeholder="0161"
                />
                <div className="text-xs text-slate-400 mt-2">Label</div>
                <input
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                  value={nameA}
                  onChange={(e) => setNameA(e.target.value)}
                  placeholder="e.g., You"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-400">
                  Card last-4 (optional)
                </div>
                <input
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                  value={l4b}
                  onChange={(e) => setL4b(e.target.value)}
                  placeholder="5280"
                />
                <div className="text-xs text-slate-400 mt-2">Label</div>
                <input
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                  value={nameB}
                  onChange={(e) => setNameB(e.target.value)}
                  placeholder="e.g., Spouse"
                />
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(3)}
              className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800"
            >
              ← Back
            </button>
            <button
              onClick={() => {
                commitSpenders();
                setStep(5);
              }}
              disabled={!step4CanContinue}
              className="rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400 disabled:opacity-60"
            >
              Save users →
            </button>
          </div>
        </section>
      )}

      {/* Step 5 – Review & Next */}
      {step === 5 && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-5">
          <h3 className="font-semibold">5) Review & Next Steps</h3>

          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-slate-700 p-3">
              <div className="text-xs text-slate-400">Parser</div>
              <div className="mt-1">
                Date format:{" "}
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {(proposal?.dateFmt as string) || "MM/DD"}
                </span>
              </div>
              <div className="mt-1">
                Regex:{" "}
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {proposal?.unifiedRegex ? "custom" : "auto"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 p-3">
              <div className="text-xs text-slate-400">Categories</div>
              <div className="mt-1">{cats.length} categories</div>
              <div className="mt-1">{rules.length} starter rules</div>
            </div>

            <div className="rounded-xl border border-slate-700 p-3">
              <div className="text-xs text-slate-400">Users</div>
              {Object.keys(spenderMap).length === 0 ? (
                <div className="mt-1">Single-user or not set</div>
              ) : (
                <ul className="mt-1 space-y-1">
                  {Object.entries(spenderMap).map(([k, v]) => (
                    <li key={k}>
                      •••• {k} — {v || "Unnamed"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 p-3 text-sm">
            <div className="font-medium mb-1">What’s next?</div>
            <ol className="list-decimal pl-5 space-y-1 text-slate-300">
              <li>Open the statement importer.</li>
              <li>Enter the statement month and beginning balance.</li>
              <li>Paste each page (one at a time) and parse totals.</li>
              <li>When everything is green, save to start reconciling.</li>
            </ol>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(4)}
              className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800"
            >
              ← Back
            </button>
            <button
              onClick={() => r.replace("/reconciler?import=1")}
              className="rounded-xl px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Open the statement importer →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
