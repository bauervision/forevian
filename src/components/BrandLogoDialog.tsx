"use client";
import React from "react";
import { useBrandMap, BrandRule } from "@/app/providers/BrandMapProvider";

function titleCase(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export default function BrandLogoDialog({
  open,
  onClose,
  seedLabel,
}: {
  open: boolean;
  onClose: () => void;
  seedLabel: string;
}) {
  const { upsertRule, logoFor, mounted } = useBrandMap();

  const [name, setName] = React.useState(titleCase(seedLabel));
  const [domain, setDomain] = React.useState("");
  const [mode, setMode] = React.useState<BrandRule["mode"]>("keywords");
  const [pattern, setPattern] = React.useState(seedLabel);

  React.useEffect(() => {
    if (!open) return;
    // initialize from seed each time dialog opens
    setName(titleCase(seedLabel));
    setPattern(seedLabel);
    setDomain("");
    setMode("keywords");
  }, [open, seedLabel]);

  if (!open) return null;

  const id =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brand";
  const demoText = pattern;
  const preview = domain ? logoFor(domain) : logoFor(name);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Assign Logo</h3>
          <button
            className="text-sm rounded-xl border border-slate-700 px-2 py-1 hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400">Brand Display Name</label>
            <input
              className="w-full rounded-xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Wendy's"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Website Domain</label>
            <input
              className="w-full rounded-xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={domain}
              onChange={(e) =>
                setDomain(e.target.value.replace(/^https?:\/\//, "").trim())
              }
              placeholder="e.g., wendys.com"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Match Mode</label>
            <select
              className="w-full rounded-xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as BrandRule["mode"])}
            >
              <option value="keywords">Contains keywords (all)</option>
              <option value="exact">Exact label</option>
              <option value="regex">Advanced regex</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">
              {mode === "keywords"
                ? "Keywords (space or comma separated)"
                : mode === "exact"
                ? "Exact label"
                : "Regex (source)"}
            </label>
            <input
              className="w-full rounded-xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={
                mode === "keywords"
                  ? "e.g., amzn mktp"
                  : mode === "exact"
                  ? "e.g., Starbucks"
                  : String(/\btaco\s*bell\b/i)
              }
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-slate-700 bg-white overflow-hidden flex items-center justify-center">
            {/* simple preview – no need to block on load errors */}
            {mounted && preview ? (
              <img
                src={preview}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <div className="h-8 w-8 bg-slate-300 rounded" />
            )}
          </div>
          <div className="text-xs text-slate-400">
            Logo preview (from domain or name guess).
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl border border-slate-700 px-3 py-2 hover:bg-slate-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-xl border border-emerald-600 bg-emerald-600/10 text-emerald-300 px-3 py-2 hover:bg-emerald-600/20"
            onClick={() => {
              const rule: BrandRule = {
                id,
                name: name.trim() || "Brand",
                domain: domain.trim(),
                mode,
                pattern: pattern.trim(),
                enabled: true,
              };
              upsertRule(rule);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
