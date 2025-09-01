// components/StatementSwitcher.tsx
"use client";
import { useMemo } from "react";
import dayjs from "dayjs";

type Statement = { id: string; label: string };

export default function StatementSwitcher({
  value,
  onChange,
  available,
  // kept for API compatibility but no longer used:
  // fallbackMonths = 6,
  label = "Statement",
  showLabel = true,
  size = "md",
  className = "",
}: {
  /** currently selected statement id (YYYY-MM) */
  value?: string;
  /** called when user picks a different statement id */
  onChange?: (id: string) => void;
  /** ids to show (YYYY-MM), any order; component hides if this is empty */
  available?: string[];
  /** deprecated: ignored; we no longer fabricate months */
  fallbackMonths?: number;
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  // If no real data, hide entirely (prevents phantom months like "August")
  const hasData = !!(available && available.length);
  if (!hasData) return null;

  // Build candidate ids (newest → oldest) from provided data only
  const allIds = useMemo(() => {
    const uniq = Array.from(new Set(available ?? []));
    uniq.sort((a, b) => (a > b ? -1 : 1)); // descending YYYY-MM
    return uniq;
  }, [available]);

  // Ensure the selected id is present in the menu (defensive)
  const idsForSelect = useMemo(() => {
    if (!value) return allIds;
    return allIds.includes(value) ? allIds : [value, ...allIds];
  }, [allIds, value]);

  const statements: Statement[] = useMemo(
    () =>
      idsForSelect.map((id) => ({
        id,
        label: dayjs(id + "-01").isValid()
          ? dayjs(id + "-01").format("MMM YYYY")
          : id,
      })),
    [idsForSelect]
  );

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
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full ${h} rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 pr-9
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500`}
        >
          {statements.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
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
