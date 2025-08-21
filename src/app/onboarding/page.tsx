// app/onboarding/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useImportProfile } from "@/lib/import/store";
import { flattenSample } from "@/lib/import/flatten";
import { rebuildFromPages } from "@/lib/import/reconcile";

type PreviewTx = {
  date: string;
  description: string;
  amount: number;
  cardLast4?: string;
};

function money(n: number) {
  return Math.abs(n).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

export default function Onboarding() {
  const r = useRouter();
  const { profile, updateProfile, ready } = useImportProfile();

  React.useEffect(() => {
    if (ready && profile) r.replace("/reconciler");
  }, [ready, profile, r]);

  // Raw user input
  const [wRaw, setWRaw] = React.useState("");
  const [dRaw, setDRaw] = React.useState("");

  // Flattened previews (derived)
  const wFlat = React.useMemo(() => flattenSample(wRaw), [wRaw]);
  const dFlat = React.useMemo(() => flattenSample(dRaw), [dRaw]);

  const [preview, setPreview] = React.useState<PreviewTx[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  const detect = () => {
    setErr(null);
    if (!wFlat || !dFlat) {
      setErr("Please paste one withdrawal example and one deposit example.");
      return;
    }

    // Primary: parse both together as a single “page”.
    const year = new Date().getFullYear();
    let parsed = rebuildFromPages([`${wFlat}\n${dFlat}`], year, () => null).txs;

    // Fallback: parse each independently then merge a small preview
    if (!parsed.length) {
      const pW = rebuildFromPages([wFlat], year, () => null).txs;
      const pD = rebuildFromPages([dFlat], year, () => null).txs;
      parsed = [...pW, ...pD];
    }

    if (!parsed.length) {
      setPreview([]);
      setErr(
        "Couldn't parse those examples. Make sure each example includes the date, description, and amount exactly as shown on your statement."
      );
      return;
    }

    setPreview(
      parsed.slice(0, 8).map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        cardLast4: t.cardLast4,
      }))
    );
  };

  const confirmAndSave = () => {
    // We just mark onboarding complete; reconciler uses the shared parser.
    updateProfile({ dateFmt: "native", unifiedRegex: "native" } as any);
    r.replace("/reconciler");
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Quick setup</h1>

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold">1) Paste two example lines</h3>
        <p className="text-sm text-slate-300">
          Paste <b>one withdrawal</b> and <b>one deposit</b> exactly as they
          appear (multi-line is fine). We’ll format them automatically.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {/* Withdrawal */}
          <div>
            <div className="text-xs text-slate-400 mb-1">
              Withdrawal example
            </div>
            <textarea
              className="w-full min-h-36 rounded-xl bg-slate-950 border border-slate-700 p-3"
              placeholder={`7/14
Purchase authorized on 07/12 Harris Te ...
Card 5280
11.09`}
              value={wRaw}
              onChange={(e) => setWRaw(e.target.value)}
            />
            <div className="mt-1 text-xs text-slate-300">
              <span className="opacity-70 mr-1">Preview:</span>
              <code className="px-2 py-1 rounded bg-slate-800 border border-slate-700">
                {wFlat || "—"}
              </code>
            </div>
          </div>

          {/* Deposit */}
          <div>
            <div className="text-xs text-slate-400 mb-1">Deposit example</div>
            <textarea
              className="w-full min-h-36 rounded-xl bg-slate-950 border border-slate-700 p-3"
              placeholder={`7/15
Employer Payroll ...
5,263.28`}
              value={dRaw}
              onChange={(e) => setDRaw(e.target.value)}
            />
            <div className="mt-1 text-xs text-slate-300">
              <span className="opacity-70 mr-1">Preview:</span>
              <code className="px-2 py-1 rounded bg-slate-800 border border-slate-700">
                {dFlat || "—"}
              </code>
            </div>
          </div>
        </div>

        <div className="mt-2 flex gap-2 items-center">
          <button
            onClick={detect}
            className="rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
          >
            Detect pattern
          </button>
          {err && <div className="text-sm text-rose-300">{err}</div>}
        </div>
      </section>

      {!!preview.length && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <h3 className="font-semibold">2) Preview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="text-left p-2 w-20">Date</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-left p-2">Last4</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-2">{t.date || "—"}</td>
                    <td className="p-2">{t.description}</td>
                    <td className="p-2">{t.cardLast4 ?? "—"}</td>
                    <td
                      className={`p-2 text-right ${
                        t.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {money(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={confirmAndSave}
              className="rounded-xl px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Save & continue
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
