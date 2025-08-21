"use client";
import React from "react";
import { useBrandMap, BrandRule } from "@/app/providers/BrandMapProvider";
import { iconForCategory, IconFromKey, type IconKey } from "@/lib/icons";

function titleCase(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}
function escapeRegex(s: string) {
  return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function regexFromLabel(label: string) {
  const esc = escapeRegex(label.trim());
  return `\\b${esc.replace(/\s+/g, "\\s*")}\\b`;
}
function makeId(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brand"
  );
}

/** Simple icon bank for the picker */
const ICON_OPTIONS: Array<{ key: IconKey; label: string }> = [
  { key: "medical", label: "Medical / Doctors" },
  { key: "therapist", label: "Therapist" },
  { key: "groceries", label: "Groceries" },
  { key: "dining", label: "Dining / Restaurants" },
  { key: "fuel", label: "Gas / Fuel" },
  { key: "utilities", label: "Utilities / Internet" },
  { key: "insurance", label: "Insurance" },
  { key: "subscriptions", label: "Subscriptions / Streaming" },
  { key: "shopping", label: "Shopping / Retail" },
  { key: "debt", label: "Debt / Credit" },
  { key: "entertainment", label: "Entertainment" },
  { key: "kids", label: "Kids / School" },
  { key: "impulse", label: "Impulse / Misc" },
  { key: "generic", label: "Generic" },
];

type LogoMode = "domain" | "infer" | "none";

export default function BrandLogoDialog({
  open,
  onClose,
  seedLabel,
}: {
  open: boolean;
  onClose: () => void;
  seedLabel: string;
}) {
  const { upsertRule, logoFor, mounted, rules, detect } = useBrandMap() as any;

  const existing: BrandRule | null = React.useMemo(() => {
    const norm = (s: string) =>
      (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    // try by display name first
    const byName = rules.find(
      (r: BrandRule) => norm(r.name) === norm(seedLabel)
    );
    if (byName) return byName;

    // try matching existing rule logic roughly
    for (const r of rules as BrandRule[]) {
      try {
        if (r.mode === "exact" && norm(r.pattern) === norm(seedLabel)) return r;
        if (r.mode === "keywords") {
          const words = r.pattern.split(/[, ]+/).map(norm).filter(Boolean);
          if (words.every((w) => norm(seedLabel).includes(w))) return r;
        }
        if (r.mode === "regex") {
          if (new RegExp(r.pattern, "i").test(seedLabel)) return r;
        }
      } catch {}
    }
    return null;
  }, [rules, seedLabel]);

  const editingIdRef = React.useRef<string | undefined>(existing?.id);
  const [name, setName] = React.useState(titleCase(seedLabel));
  const [domain, setDomain] = React.useState(existing?.domain || "");
  const [mode, setMode] = React.useState<BrandRule["mode"]>(
    existing?.mode || "keywords"
  );
  const [pattern, setPattern] = React.useState(existing?.pattern || seedLabel);

  // NEW: logo mode + icon picker
  const initialLogoMode: LogoMode = existing?.noLogo
    ? "none"
    : existing?.domain
    ? "domain"
    : "infer";
  const [logoMode, setLogoMode] = React.useState<LogoMode>(initialLogoMode);
  const [iconKey, setIconKey] = React.useState<IconKey>(
    (existing?.icon as IconKey) || "generic"
  );

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      editingIdRef.current = existing.id;
      setName(existing.name);
      setDomain(existing.domain || "");
      setMode(existing.mode);
      setPattern(existing.pattern);
      setLogoMode(
        existing.noLogo ? "none" : existing.domain ? "domain" : "infer"
      );
      setIconKey((existing.icon as IconKey) || "generic");
    } else {
      editingIdRef.current = undefined;
      setName(titleCase(seedLabel));
      setDomain("");
      setMode("keywords");
      setPattern(seedLabel);
      setLogoMode("infer");
      setIconKey("generic");
    }
  }, [open, seedLabel, existing]);

  if (!open) return null;

  // Preview obeys logoMode
  const preview =
    logoMode === "none"
      ? null
      : logoMode === "domain" && domain
      ? logoFor(domain)
      : logoFor(name); // infer

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Brand Visuals</h3>
          <button
            className="text-sm rounded-xl border border-slate-700 px-2 py-1 hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Name + Domain + Match */}
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
              disabled={logoMode !== "domain"}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Match Mode</label>
            <select
              className="w-full rounded-xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as BrandRule["mode"])}
            >
              <option value="regex">Advanced regex</option>
              <option value="keywords">Contains keywords (all)</option>
              <option value="exact">Exact label</option>
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
                  : String(/\bamazon\s*marketplace\b/i)
              }
            />
          </div>
        </div>

        {/* Logo mode + Icon picker */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400">Logo Mode</label>
            <div className="mt-1 grid grid-cols-1 gap-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="logoMode"
                  checked={logoMode === "domain"}
                  onChange={() => setLogoMode("domain")}
                />
                <span>Use website logo (domain)</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="logoMode"
                  checked={logoMode === "infer"}
                  onChange={() => setLogoMode("infer")}
                />
                <span>Infer logo from name</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="logoMode"
                  checked={logoMode === "none"}
                  onChange={() => setLogoMode("none")}
                />
                <span>No logo (use icon)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400">
              Icon (when no logo)
            </label>
            <select
              className="w-full rounded-xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={iconKey}
              onChange={(e) => setIconKey(e.target.value as IconKey)}
              disabled={logoMode !== "none"}
            >
              {ICON_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preview + actions */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-slate-700 bg-white overflow-hidden flex items-center justify-center">
            {mounted && preview ? (
              <img
                src={preview}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <IconFromKey icon={iconKey} className="h-6 w-6 text-slate-600" />
            )}
          </div>
          <div className="text-xs text-slate-400 flex gap-2 flex-wrap">
            <button
              type="button"
              className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
              onClick={() => {
                // Clear → force icon mode
                setLogoMode("none");
                setDomain("");
              }}
              title="Clear any inferred/assigned logo and use an icon instead"
            >
              Clear logo (use icon)
            </button>
            <button
              type="button"
              className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
              onClick={() => {
                // Try detect again; if it finds a domain, prefill and switch to domain
                const hit = detect(name);
                if (hit?.domain) {
                  setDomain(hit.domain);
                  setLogoMode("domain");
                } else {
                  setDomain("");
                  setLogoMode("infer"); // let provider guess via name
                }
              }}
              title="Try to find a better website logo automatically"
            >
              Re-run inference
            </button>
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
              const safePattern =
                (pattern || "").trim() ||
                (mode === "regex"
                  ? regexFromLabel(name)
                  : mode === "keywords"
                  ? name
                  : name.toLowerCase());

              const id = editingIdRef.current ?? makeId(name);
              const rule: BrandRule = {
                id,
                name: name.trim() || "Brand",
                domain: logoMode === "domain" ? domain.trim() : "",
                mode,
                pattern: safePattern,
                enabled: true,
                noLogo: logoMode === "none", // NEW
                icon: logoMode === "none" ? iconKey : existing?.icon ?? null, // NEW
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
