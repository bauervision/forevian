// components/StatementSwitcher.tsx
"use client";
import React from "react";
import dayjs from "dayjs";

function normalizeId(raw?: string): string | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
}
function toLabel(id: string) {
  const d = dayjs(id + "-01");
  return d.isValid() ? d.format("MMM YYYY") : id;
}

export default function StatementSwitcher({
  value,
  onChange,
  available,
  label = "Statement",
  showLabel = true,
  size = "md",
  className = "",
}: {
  value?: string;
  onChange?: (id: string) => void;
  available?: string[];
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const allIds = React.useMemo(() => {
    const normed = (available ?? [])
      .map(normalizeId)
      .filter((x): x is string => !!x);
    const uniq = Array.from(new Set(normed));
    uniq.sort((a, b) => (a > b ? -1 : 1)); // newest → oldest
    return uniq;
  }, [available]);

  if (allIds.length === 0) return null;

  const normalizedValue = normalizeId(value ?? "") || "";
  // If parent hasn’t provided a value yet, we *display* newest,
  // but we DO NOT call onChange ourselves.
  const effectiveValue =
    normalizedValue && allIds.includes(normalizedValue)
      ? normalizedValue
      : allIds[0];

  const h = size === "sm" ? "h-9 text-sm" : "h-10";

  return (
    <div className={`w-full ${className || "sm:w-56"}`}>
      {showLabel && (
        <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          aria-label={label}
          value={effectiveValue}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full ${h} rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 pr-9
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500`}
        >
          {allIds.map((id) => (
            <option key={id} value={id}>
              {toLabel(id)}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.086l3.71-3.854a.75.75 0 111.08 1.04l-4.24 4.4a.75.75 0 01-1.08 0l-4.24-4.4a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}
